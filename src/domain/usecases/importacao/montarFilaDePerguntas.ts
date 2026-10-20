import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { textoParaRegra, type Categorizacao } from './categorizar';
import {
  detectarParcelamentos,
  detectarRecorrencias,
  pistaDaRecorrencia,
  type LinhaGravada,
} from './detectarPadroes';
import { montarRegistroDeImportacao, naturezaDaLinha, type DiasDoCartao, type ItemDaAnalise } from './analisarImportacao';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import type { RegistroDeImportacao } from '@/domain/repositories/importacoesRepository';
import type {
  CompraParcelada,
  ContaFixa,
  GastoRapido,
  Movimentacao,
  Parcela,
  RegraCategorizacao,
} from '@/domain/types/entities';
import type { LinhaDaPergunta, PerguntaNova } from '@/domain/types/perguntas';
import type { ExtratoLido } from './tipos';

export type ContextoDaFila = {
  extrato: ExtratoLido;
  destino: DestinoImportacao;
  /** Todos os itens da análise (para achar dúvidas que ficaram de fora). */
  itens: ItemDaAnalise[];
  /** O que vai ser gravado (já com as categorias escolhidas na prévia). */
  registro: RegistroDeImportacao;
  cartao: DiasDoCartao | null;
  mesDaFatura: string | null;
  /** Para agrupar histórico pelo mesmo comerciante (o mesmo categorizador da análise). */
  categorizar: (linha: { descricao: string; natureza: 'despesa' | 'receita' }) => Categorizacao;
  movimentacoes: Movimentacao[];
  gastos: GastoRapido[];
  contasFixas: ContaFixa[];
  compras: CompraParcelada[];
  parcelas: Parcela[];
  regras: RegraCategorizacao[];
  descricaoDoExistente: (existenteId: string) => { descricao: string; data: string; valor: number } | null;
};

const linhaDaPergunta = (l: LinhaGravada): LinhaDaPergunta => ({ importacaoId: null, idExterno: l.transacao.idExterno, onde: l.onde });
const somar = (linhas: LinhaGravada[]) => linhas.reduce((soma, l) => soma + Math.abs(l.transacao.valor), 0);
const vezes = (n: number) => (n === 1 ? '1 vez' : `${n} vezes`);

/**
 * Transforma o que a importação não conseguiu resolver sozinha em perguntas, agrupadas
 * (5 PIX para a mesma pessoa = 1 pergunta; 14 linhas "IFOOD" sem categoria = 1 pergunta) e
 * ordenadas pelo impacto em dinheiro:
 * - compra parcelada nova na fatura ("criar compra de 10x? faltam 7 parcelas");
 * - despesa que se repete há 3 meses ("virar conta fixa?");
 * - PIX para pessoa sem contato ("quem é Fulano?");
 * - linhas sem categoria (confiança abaixo de 0,7);
 * - possíveis duplicatas que ficaram de fora ("é o mesmo que você lançou?").
 */
export function montarFilaDePerguntas(contexto: ContextoDaFila): PerguntaNova[] {
  const { extrato, destino, itens, registro } = contexto;
  const itemPorId = new Map(itens.map((i) => [i.transacao.idExterno, i]));

  // linhas que serão gravadas como lançamento comum (as conciliadas não perguntam nada)
  const gravadas: LinhaGravada[] = [];
  const comuns = [
    ...registro.movimentacoes
      .filter((m) => m.origem === 'manual' && m.tipo !== 'transferencia')
      .map((m) => ({ idExterno: m.idExterno, categoriaId: m.categoriaId ?? null, membroId: m.membroId ?? null, onde: 'movimentacao' as const })),
    ...registro.gastos.map((g) => ({ idExterno: g.idExterno, categoriaId: g.categoriaId ?? null, membroId: g.membroId ?? null, onde: 'gasto' as const })),
  ];
  for (const comum of comuns) {
    const item = comum.idExterno ? itemPorId.get(comum.idExterno) : undefined;
    if (!item) continue;
    gravadas.push({
      transacao: item.transacao,
      onde: comum.onde,
      categoriaId: comum.categoriaId,
      membroId: comum.membroId,
      categorizacao: item.categorizacao,
    });
  }

  const perguntas: PerguntaNova[] = [];
  const respondidasPorOutra = new Set<string>();

  // 1. compra parcelada nova (só fatura de cartão)
  for (const p of detectarParcelamentos(gravadas, destino, contexto.cartao, contexto.mesDaFatura, contexto.compras, contexto.parcelas)) {
    if (destino.tipo !== 'cartao') break;
    const faltam = p.marca.total - p.marca.numero;
    const valor = Math.abs(p.linha.transacao.valor);
    const dataOriginal = p.linha.transacao.data;
    perguntas.push({
      tipo: 'parcelamento',
      chave: `parc:${destino.cartaoId}:${textoParaRegra(p.descricao)}:${p.marca.total}:${valor}`,
      titulo: `Criar compra parcelada de ${p.marca.total} vezes?`,
      pista: `${p.descricao}: parcela ${p.marca.numero} de ${p.marca.total} de ${formatarMoeda(valor)}. Faltam ${faltam} ${faltam === 1 ? 'parcela' : 'parcelas'} (${formatarMoeda(faltam * valor)}).`,
      valor: faltam * valor,
      quantidade: 1,
      dados: {
        tipo: 'parcelamento',
        descricao: p.descricao,
        valorParcela: valor,
        numero: p.marca.numero,
        total: p.marca.total,
        cartaoId: destino.cartaoId,
        mesDaFatura: p.mesDaFatura,
        dataCompra: dataOriginal,
        categoriaId: p.linha.categoriaId,
        membroId: p.linha.membroId,
        linhas: [linhaDaPergunta(p.linha)],
      },
    });
  }

  // 2. recorrência que pode virar conta fixa
  const chaveDe = (descricao: string) => {
    const c = contexto.categorizar({ descricao, natureza: 'despesa' });
    if (c.comerciante) return { chave: `com:${c.comerciante}`, nome: c.comerciante, assinatura: c.assinatura };
    if (c.pessoaPix) return { chave: `pix:${c.pessoaPix}`, nome: c.pessoaPix, assinatura: false };
    const texto = textoParaRegra(descricao);
    return { chave: texto === '' ? '' : `txt:${texto}`, nome: descricao.trim(), assinatura: false };
  };
  const recorrencias = detectarRecorrencias({
    linhas: gravadas,
    chaveDe,
    movimentacoes: contexto.movimentacoes,
    gastos: contexto.gastos,
    contasFixas: contexto.contasFixas,
    regras: contexto.regras,
  });
  for (const r of recorrencias) {
    const categoriaId = r.linhas.find((l) => l.categoriaId !== null)?.categoriaId ?? null;
    perguntas.push({
      tipo: 'recorrencia',
      chave: `rec:${r.chave}`,
      titulo: 'Transformar em conta fixa mensal?',
      pista: pistaDaRecorrencia(r),
      valor: r.valor * 12,
      quantidade: r.linhas.length,
      dados: {
        tipo: 'recorrencia',
        nome: r.nome,
        padrao: r.padrao,
        valor: r.valor,
        dia: r.dia,
        meses: r.meses,
        assinatura: r.assinatura,
        destino,
        categoriaId,
        linhas: r.linhas.map(linhaDaPergunta),
      },
    });
  }

  // 3. PIX para pessoa sem contato e sem categoria: uma pergunta por pessoa
  const porPessoa = new Map<string, LinhaGravada[]>();
  for (const l of gravadas) {
    const pessoa = l.categorizacao?.pessoaPix;
    if (!pessoa || l.categoriaId !== null || l.onde !== 'movimentacao') continue;
    porPessoa.set(pessoa, [...(porPessoa.get(pessoa) ?? []), l]);
  }
  for (const [nome, linhas] of porPessoa) {
    linhas.forEach((l) => respondidasPorOutra.add(l.transacao.idExterno));
    const enviados = linhas.filter((l) => l.transacao.valor < 0);
    const recebidos = linhas.length - enviados.length;
    const partes = [
      enviados.length > 0 ? `${enviados.length} PIX ${enviados.length === 1 ? 'enviado' : 'enviados'}` : null,
      recebidos > 0 ? `${recebidos} ${recebidos === 1 ? 'recebido' : 'recebidos'}` : null,
    ].filter(Boolean);
    perguntas.push({
      tipo: 'pix_pessoa',
      chave: `pix:${nome}`,
      titulo: `Quem é ${nome}?`,
      pista: `${partes.join(' e ')}, ${formatarMoeda(somar(linhas))} no total`,
      valor: somar(linhas),
      quantidade: linhas.length,
      dados: {
        tipo: 'pix_pessoa',
        natureza: enviados.length >= recebidos ? 'despesa' : 'receita',
        nome,
        exemplo: linhas[0].transacao.descricao,
        linhas: linhas.map(linhaDaPergunta),
      },
    });
  }

  // 4. sem categoria: agrupado pelo texto da descrição
  const porTexto = new Map<string, LinhaGravada[]>();
  for (const l of gravadas) {
    if (l.categoriaId !== null || respondidasPorOutra.has(l.transacao.idExterno)) continue;
    const natureza = naturezaDaLinha(l.transacao, destino);
    const chave = `${natureza}|${textoParaRegra(l.transacao.descricao)}`;
    porTexto.set(chave, [...(porTexto.get(chave) ?? []), l]);
  }
  for (const [chave, linhas] of porTexto) {
    const [natureza, padrao] = chave.split('|') as ['despesa' | 'receita', string];
    const sugestao = linhas.map((l) => l.categorizacao?.categoriaId ?? null).find((id) => id !== null) ?? null;
    perguntas.push({
      tipo: 'categoria',
      chave: `cat:${chave}`,
      titulo: natureza === 'despesa' ? 'Que gasto é este?' : 'Que entrada é esta?',
      pista:
        linhas.length > 1
          ? `Apareceu ${vezes(linhas.length)}, ${formatarMoeda(somar(linhas))} no total`
          : (linhas[0].categorizacao?.motivo ?? 'Não reconhecido'),
      valor: somar(linhas),
      quantidade: linhas.length,
      dados: {
        tipo: 'categoria',
        natureza,
        padrao,
        exemplo: linhas[0].transacao.descricao,
        sugestaoCategoriaId: sugestao,
        linhas: linhas.map(linhaDaPergunta),
      },
    });
  }

  // 5. possíveis duplicatas que ficaram de fora
  const gravadasIds = new Set(gravadas.map((l) => l.transacao.idExterno));
  for (const item of itens) {
    if (item.situacao.tipo !== 'duvida' || gravadasIds.has(item.transacao.idExterno)) continue;
    if (registro.movimentacoes.some((m) => m.idExterno === item.transacao.idExterno)) continue;
    if (registro.gastos.some((g) => g.idExterno === item.transacao.idExterno)) continue;
    const existente = contexto.descricaoDoExistente(item.situacao.existenteId);
    if (!existente) continue;
    const t = item.transacao;
    // o que gravar se forem diferentes: a linha como lançamento comum, com a categoria sugerida
    const sozinha = montarRegistroDeImportacao({
      arquivo: '',
      extrato,
      destino,
      linhas: [{ transacao: t, categoriaId: item.categoriaSugerida, conciliacao: null }],
      agora: new Date(0),
      fatura: contexto.cartao && contexto.mesDaFatura ? { mes: contexto.mesDaFatura, cartao: contexto.cartao } : null,
    });
    perguntas.push({
      tipo: 'duplicidade',
      chave: `dup:${t.idExterno}`,
      titulo: 'Você já lançou isto?',
      pista: `Parece com "${existente.descricao}" de ${formatarData(existente.data)} (${formatarMoeda(existente.valor)})`,
      valor: Math.abs(t.valor),
      quantidade: 1,
      dados: {
        tipo: 'duplicidade',
        linha: { data: t.data, descricao: t.descricao, valor: t.valor, idExterno: t.idExterno },
        existente,
        registro: { movimentacao: sozinha.movimentacoes[0] ?? null, gasto: sozinha.gastos[0] ?? null },
        linhas: [],
      },
    });
  }

  return perguntas.sort((a, b) => b.valor - a.valor);
}
