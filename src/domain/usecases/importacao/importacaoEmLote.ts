import { NOMES_DOS_BANCOS, bancoPorTexto } from './bancos';
import { identificadorDoExtrato, nomeDaContaNova } from './dadosDoArquivo';
import { semelhanca } from './deduplicar';
import { semAcentos } from './normalizarDescricao';
import { historicoDeCategorias, prepararCategorizador } from './categorizar';
import {
  absorvidasDoDestino,
  analisarImportacao,
  existentesDoDestino,
  linhaDoItem,
  montarRegistroDeImportacao,
  sugerirMesDaFatura,
  type InteligenciaDaImportacao,
  type ResumoDaAnalise,
} from './analisarImportacao';
import { montarFilaDePerguntas } from './montarFilaDePerguntas';
import type { LancamentoExistente } from './deduplicar';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import type { RegistroDeImportacao } from '@/domain/repositories/importacoesRepository';
import type {
  Cartao,
  Categoria,
  CompraParcelada,
  ContaBancaria,
  ContaFixa,
  ContatoPix,
  Fatura,
  GastoRapido,
  Movimentacao,
  Parcela,
  RegraCategorizacao,
} from '@/domain/types/entities';
import type { ExtratoLido } from './tipos';

/**
 * Importação de vários arquivos de uma vez (o ano todo, de várias contas e cartões): decide para
 * onde vai cada arquivo — conta ou cartão que já existe, ou um novo, criado com o que o arquivo
 * diz (banco, agência/conta, corrente ou poupança, saldo anterior, limite e dias do cartão) —,
 * em que ordem importar e o que gravar de cada um, sem prévia (o que precisar de você vai para
 * a Revisão).
 */

export type DestinoNoLote =
  | { tipo: 'conta'; contaBancariaId: number }
  | { tipo: 'cartao'; cartaoId: number }
  | { tipo: 'nova_conta'; grupo: string }
  | { tipo: 'novo_cartao'; grupo: string }
  | { tipo: 'pular' };

export type ContaNova = { grupo: string; banco: string; nomeConta: string; saldoInicial: number; identificadorExtrato: string | null };
export type CartaoNovo = { grupo: string; nome: string; limite: number; diaFechamento: number; diaVencimento: number };
export type ArquivoDoLote = { chave: string; nome: string; extrato: ExtratoLido };

export type PlanoDoLote = {
  destinos: Record<string, DestinoNoLote>;
  contasNovas: ContaNova[];
  cartoesNovos: CartaoNovo[];
};

type ContaParaLote = Pick<ContaBancaria, 'id' | 'banco' | 'nomeConta' | 'identificadorExtrato' | 'ativo'>;
type CartaoParaLote = Pick<Cartao, 'id' | 'nome' | 'ativo'>;

const POUPANCA = /POUP/;
const ehPoupanca = (conta: Pick<ContaBancaria, 'nomeConta' | 'banco'>) => POUPANCA.test(semAcentos(`${conta.nomeConta} ${conta.banco}`));
const inicioDoArquivo = (a: ArquivoDoLote) => a.extrato.periodo?.inicio ?? a.extrato.vencimentoFatura ?? '9999';

function grupoDaConta(extrato: ExtratoLido): string {
  return identificadorDoExtrato(extrato) ?? `${extrato.banco ?? 'outro'}|${extrato.conta?.tipo ?? 'corrente'}`;
}

function grupoDoCartao(extrato: ExtratoLido): string {
  return `${extrato.banco ?? 'outro'}|${semAcentos(extrato.cartao?.nome ?? '')}`;
}

/** Para onde vai cada arquivo, e as contas e cartões que precisam ser criados. */
export function planejarLote(arquivos: ArquivoDoLote[], contas: ContaParaLote[], cartoes: CartaoParaLote[]): PlanoDoLote {
  const destinos: Record<string, DestinoNoLote> = {};
  // identificador que cada conta já tem (ou ganhou neste lote): outra conta do mesmo banco não cai nela
  const idDaConta = new Map(contas.map((c) => [c.id, c.identificadorExtrato ?? null]));
  const contasNovas = new Map<string, ContaNova & { inicio: string }>();
  const cartoesNovos = new Map<string, CartaoNovo & { inicio: string }>();
  const ativas = contas.filter((c) => c.ativo !== false);

  for (const arquivo of [...arquivos].sort((a, b) => inicioDoArquivo(a).localeCompare(inicioDoArquivo(b)))) {
    const { extrato } = arquivo;
    if (extrato.origem === 'cartao') {
      const doBanco = cartoes.filter((c) => c.ativo !== false && extrato.banco !== null && bancoPorTexto(c.nome) === extrato.banco);
      const nome = extrato.cartao?.nome ?? '';
      const escolhido = [...doBanco].sort((a, b) => semelhanca(b.nome, nome) - semelhanca(a.nome, nome))[0];
      if (escolhido) {
        destinos[arquivo.chave] = { tipo: 'cartao', cartaoId: escolhido.id };
        continue;
      }
      const grupo = grupoDoCartao(extrato);
      const diaVencimento = extrato.cartao?.diaVencimento ?? (extrato.vencimentoFatura ? Number(extrato.vencimentoFatura.slice(8, 10)) : 10);
      const fechamento = extrato.cartao?.diaFechamento ?? (diaVencimento - 7 > 0 ? diaVencimento - 7 : diaVencimento + 23);
      const novo: CartaoNovo & { inicio: string } = {
        grupo,
        nome: extrato.cartao?.nome ?? `Cartão ${extrato.banco ? NOMES_DOS_BANCOS[extrato.banco] : 'importado'}`,
        limite: extrato.cartao?.limite ?? 0,
        diaFechamento: Math.min(31, Math.max(1, fechamento)),
        diaVencimento: Math.min(31, Math.max(1, diaVencimento)),
        inicio: inicioDoArquivo(arquivo),
      };
      const atual = cartoesNovos.get(grupo);
      // a fatura mais nova manda (limite e dias atuais)
      if (!atual || novo.inicio >= atual.inicio) cartoesNovos.set(grupo, { ...novo, limite: novo.limite || atual?.limite || 0 });
      destinos[arquivo.chave] = { tipo: 'novo_cartao', grupo };
      continue;
    }

    const identificador = identificadorDoExtrato(extrato);
    const porIdentificador = identificador ? ativas.find((c) => idDaConta.get(c.id) === identificador) : undefined;
    const poupanca = extrato.conta?.tipo === 'poupanca';
    const candidata =
      porIdentificador ??
      ativas.find(
        (c) =>
          extrato.banco !== null &&
          bancoPorTexto(`${c.banco} ${c.nomeConta}`) === extrato.banco &&
          ehPoupanca(c) === poupanca &&
          (identificador === null || idDaConta.get(c.id) === null || idDaConta.get(c.id) === identificador)
      );
    if (candidata) {
      if (identificador && idDaConta.get(candidata.id) === null) idDaConta.set(candidata.id, identificador);
      destinos[arquivo.chave] = { tipo: 'conta', contaBancariaId: candidata.id };
      continue;
    }
    const grupo = grupoDaConta(extrato);
    const atual = contasNovas.get(grupo);
    const inicio = inicioDoArquivo(arquivo);
    if (!atual || inicio < atual.inicio) {
      contasNovas.set(grupo, {
        grupo,
        banco: extrato.banco ? NOMES_DOS_BANCOS[extrato.banco] : 'Outro banco',
        nomeConta: nomeDaContaNova(extrato.banco, extrato.banco ? NOMES_DOS_BANCOS[extrato.banco] : '', extrato.conta),
        // o saldo de antes do extrato mais antigo: com tudo importado, o saldo do app bate com o do banco
        saldoInicial: extrato.saldoAnterior ?? 0,
        identificadorExtrato: identificador,
        inicio,
      });
    }
    destinos[arquivo.chave] = { tipo: 'nova_conta', grupo };
  }

  const semInicio = <T extends { inicio: string }>({ inicio: _inicio, ...resto }: T) => resto;
  return {
    destinos,
    contasNovas: [...contasNovas.values()].map(semInicio),
    cartoesNovos: [...cartoesNovos.values()].map(semInicio),
  };
}

/**
 * Ordem de importação: mês a mês; no mesmo mês, faturas antes das contas (o pagamento da fatura
 * no extrato da conta precisa achar as compras) e conta corrente antes da poupança (a
 * transferência entre elas entra uma vez só e o outro lado é reconhecido).
 */
export function ordenarLote(arquivos: ArquivoDoLote[]): ArquivoDoLote[] {
  const peso = (a: ArquivoDoLote) => (a.extrato.origem === 'cartao' ? 0 : a.extrato.conta?.tipo === 'poupanca' ? 2 : 1);
  return [...arquivos].sort(
    (a, b) =>
      inicioDoArquivo(a).slice(0, 7).localeCompare(inicioDoArquivo(b).slice(0, 7)) ||
      peso(a) - peso(b) ||
      inicioDoArquivo(a).localeCompare(inicioDoArquivo(b)) ||
      a.nome.localeCompare(b.nome)
  );
}

/** Tudo o que já está no app e que a importação usa para categorizar, conciliar e deduplicar. */
export type BaseDaImportacao = {
  categorias: Categoria[];
  regras: RegraCategorizacao[];
  contatos: ContatoPix[];
  contas: ContaBancaria[];
  cartoes: Cartao[];
  contasFixas: ContaFixa[];
  parcelas: Parcela[];
  compras: CompraParcelada[];
  gastos: GastoRapido[];
  faturas: Fatura[];
  movimentacoes: Movimentacao[];
  importacoes: { efeitos: string | null }[];
  nomesProprios: string[];
};

export function montarInteligencia(base: BaseDaImportacao, mesDaFatura: string | null): InteligenciaDaImportacao {
  return {
    categorizar: prepararCategorizador({
      categorias: base.categorias,
      regras: base.regras,
      contatos: base.contatos,
      historico: historicoDeCategorias(base.movimentacoes, base.gastos),
      nomesProprios: base.nomesProprios,
    }),
    categorias: base.categorias,
    mesDaFatura,
    dados: {
      contas: base.contas,
      cartoes: base.cartoes,
      contasFixas: base.contasFixas,
      parcelas: base.parcelas,
      compras: base.compras,
      gastos: base.gastos,
      faturas: base.faturas,
      movimentacoes: base.movimentacoes,
      nomesProprios: base.nomesProprios,
    },
  };
}

export function existentesParaImportar(destino: DestinoImportacao, base: BaseDaImportacao): LancamentoExistente[] {
  return [...existentesDoDestino(destino, base.movimentacoes, base.gastos), ...absorvidasDoDestino(destino, base.importacoes)];
}

/** O que gravar de um arquivo sem prévia: o que a análise marcaria sozinha, e as perguntas. */
export function prepararImportacaoAutomatica(params: {
  arquivo: string;
  extrato: ExtratoLido;
  destino: DestinoImportacao;
  base: BaseDaImportacao;
  agora: Date;
}): { registro: RegistroDeImportacao; resumo: ResumoDaAnalise; mesDaFatura: string | null } {
  const { arquivo, extrato, destino, base, agora } = params;
  const cartao = destino.tipo === 'cartao' ? (base.cartoes.find((c) => c.id === destino.cartaoId) ?? null) : null;
  const mesDaFatura = cartao ? sugerirMesDaFatura(extrato, cartao) : null;
  const inteligencia = montarInteligencia(base, mesDaFatura);
  const existentes = existentesParaImportar(destino, base);
  const { itens, resumo } = analisarImportacao(extrato, destino, existentes, inteligencia);
  const registro = montarRegistroDeImportacao({
    arquivo,
    extrato,
    destino,
    linhas: itens.filter((i) => i.incluirPorPadrao).map((i) => linhaDoItem(i)),
    agora,
    fatura: cartao && mesDaFatura ? { mes: mesDaFatura, cartao } : null,
  });
  registro.perguntas = montarFilaDePerguntas({
    extrato,
    destino,
    itens,
    registro,
    cartao,
    mesDaFatura,
    categorizar: inteligencia.categorizar,
    movimentacoes: base.movimentacoes,
    gastos: base.gastos,
    contasFixas: base.contasFixas,
    compras: base.compras,
    parcelas: base.parcelas,
    regras: base.regras,
    descricaoDoExistente: (id) => {
      const existente = existentes.find((e) => e.id === id);
      return existente ? { descricao: existente.descricao, data: existente.data, valor: Math.abs(existente.valor) } : null;
    },
  });
  return { registro, resumo, mesDaFatura };
}

/**
 * Extrato de conta que cobre vários meses vira um pedaço por mês, importados na ordem do lote:
 * assim o pagamento de cada fatura encontra as compras da fatura daquele mês já no app.
 */
export function dividirPorMes(arquivo: ArquivoDoLote): ArquivoDoLote[] {
  const { extrato } = arquivo;
  if (extrato.origem === 'cartao') return [arquivo];
  const meses = [...new Set(extrato.transacoes.map((t) => t.data.slice(0, 7)))].sort();
  if (meses.length <= 1) return [arquivo];
  return meses.map((mes, i) => {
    const transacoes = extrato.transacoes.filter((t) => t.data.startsWith(mes));
    const datas = transacoes.map((t) => t.data).sort();
    return {
      chave: `${arquivo.chave}#${mes}`,
      nome: `${arquivo.nome} (${mes.slice(5, 7)}/${mes.slice(0, 4)})`,
      extrato: {
        ...extrato,
        transacoes,
        ignoradas: i === 0 ? extrato.ignoradas : 0,
        periodo: { inicio: datas[0], fim: datas[datas.length - 1] },
        saldoAnterior: i === 0 ? extrato.saldoAnterior : null,
      },
    };
  });
}
