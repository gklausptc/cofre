import { addDays, format, parseISO } from 'date-fns';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia, mesAnterior } from '@/core/utils/date';
import { ARTIGOS_DE_AJUDA } from '@/domain/dados/ajuda';
import { COMO_EXPORTAR } from '@/domain/dados/comoExportar';
import { NOMES_DOS_BANCOS, bancoPorTexto } from '@/domain/usecases/importacao/bancos';
import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import type { LivreParaGastar } from '@/domain/usecases/calcularLivreParaGastar';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { Cartao, Categoria } from '@/domain/types/entities';

/**
 * Assistente da Ajuda, sem IA: entende algumas perguntas sobre os seus números (quanto gastei,
 * saldo, livre para gastar, fatura, maior gasto, quanto entrou) e as dúvidas de uso (artigos de
 * `ARTIGOS_DE_AJUDA` e "como exportar" de cada banco), pelas palavras da pergunta.
 */

export type AcaoDoAssistente = { rotulo: string; href: string };
export type RespostaDoAssistente = { texto: string; acoes: AcaoDoAssistente[] };

export type ContextoDoAssistente = {
  hoje: string;
  /** Lançamentos de ~13 meses para trás até ~2 para a frente (`obterLancamentosDoPeriodo`). */
  lancamentos: LancamentoDoPeriodo[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[];
  contas: { id: number; nome: string; saldo: number }[];
  cartoes: Pick<Cartao, 'id' | 'nome'>[];
  livre: LivreParaGastar;
};

type Periodo = { nome: string; filtro: (l: LancamentoDoPeriodo) => boolean };

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

/** Período da pergunta ("hoje", "esta semana", "mês passado", "em setembro", "este ano"); padrão: este mês. */
function periodoDa(texto: string, hoje: string): Periodo {
  const mesDeHoje = hoje.slice(0, 7);
  const porMes = (mes: string, nome: string): Periodo => ({ nome, filtro: (l) => l.competencia === mes });
  if (/\bHOJE\b/.test(texto)) return { nome: 'hoje', filtro: (l) => l.data === hoje };
  if (/\bONTEM\b/.test(texto)) {
    const ontem = format(addDays(parseISO(hoje), -1), 'yyyy-MM-dd');
    return { nome: 'ontem', filtro: (l) => l.data === ontem };
  }
  if (/SEMANA/.test(texto)) {
    const inicio = format(addDays(parseISO(hoje), -6), 'yyyy-MM-dd');
    return { nome: 'nos últimos 7 dias', filtro: (l) => l.data >= inicio && l.data <= hoje };
  }
  if (/MES PASSADO|ULTIMO MES|MES ANTERIOR/.test(texto)) return porMes(mesAnterior(mesDeHoje), `em ${formatarMesReferencia(mesAnterior(mesDeHoje))}`);
  if (/ANO PASSADO/.test(texto)) {
    const ano = String(Number(hoje.slice(0, 4)) - 1);
    return { nome: `em ${ano}`, filtro: (l) => l.competencia.startsWith(`${ano}-`) };
  }
  if (/\b(ESTE|ESSE|NESTE|NESSE|NO|DO) ANO\b|\bANO\b/.test(texto)) {
    const ano = hoje.slice(0, 4);
    return { nome: `em ${ano}`, filtro: (l) => l.competencia.startsWith(`${ano}-`) };
  }
  const indice = MESES.findIndex((m) => new RegExp(`\\b${m}\\b`).test(texto));
  if (indice >= 0) {
    const anoNoTexto = texto.match(/\b(20\d{2})\b/)?.[1];
    const anoAtual = Number(hoje.slice(0, 4));
    const ano = anoNoTexto ? Number(anoNoTexto) : indice + 1 > Number(hoje.slice(5, 7)) ? anoAtual - 1 : anoAtual;
    const mes = `${ano}-${String(indice + 1).padStart(2, '0')}`;
    return porMes(mes, `em ${formatarMesReferencia(mes)}`);
  }
  return porMes(mesDeHoje, 'este mês');
}

const PALAVRAS_DE_PERIODO =
  /\b(ESTE|ESSE|NESTE|NESSE|NO|NA|EM|DO|DA|DE|ESTA|ESSA|NESTA|NESSA)?\s*(MES PASSADO|ULTIMO MES|MES ANTERIOR|ANO PASSADO|MES|ANO|SEMANA|HOJE|ONTEM|JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO|20\d{2})\b/g;

/** O que vem depois de "com"/"no"/"em" na pergunta ("gastei com mercado" → "MERCADO"). */
function assuntoDa(texto: string): string | null {
  const achado = texto.match(/\b(?:COM|NO|NA|NOS|NAS|EM|DE)\s+(.+)$/);
  if (!achado) return null;
  const assunto = achado[1]
    .replace(PALAVRAS_DE_PERIODO, ' ')
    .replace(/\b(O|A|OS|AS|UM|UMA|MEU|MINHA|MEUS|MINHAS|QUANTO|GASTEI|GASTO|GASTOS)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return assunto.length >= 2 ? assunto : null;
}

const somar = (lista: LancamentoDoPeriodo[]) => lista.reduce((s, l) => s + l.valor, 0);

function porCategoria(lista: LancamentoDoPeriodo[], categorias: ContextoDoAssistente['categorias']): { nome: string; total: number }[] {
  const totais = new Map<number | null, number>();
  for (const l of lista) totais.set(l.categoriaId, (totais.get(l.categoriaId) ?? 0) + l.valor);
  return [...totais]
    .map(([id, total]) => ({ nome: categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria', total }))
    .sort((a, b) => b.total - a.total);
}

function responderComoExportar(texto: string): RespostaDoAssistente {
  const banco = bancoPorTexto(texto);
  const guia = banco ? COMO_EXPORTAR.find((g) => g.banco === banco) : undefined;
  if (guia) {
    return {
      texto: `${NOMES_DOS_BANCOS[guia.banco]}\n• Conta: ${guia.conta}\n• Cartão: ${guia.cartao}`,
      acoes: [{ rotulo: 'Importar extratos', href: '/importar-extrato' }],
    };
  }
  return {
    texto: `Me diga o banco (por exemplo: "como exportar o extrato do Nubank"). Conheço: ${COMO_EXPORTAR.map((g) => NOMES_DOS_BANCOS[g.banco]).join(', ')}. Em geral: no app ou site do banco, procure Extrato → Exportar/Baixar → CSV, OFX ou PDF.`,
    acoes: [{ rotulo: 'Importar extratos', href: '/importar-extrato' }],
  };
}

function responderArtigo(texto: string): RespostaDoAssistente | null {
  let melhor: { artigo: (typeof ARTIGOS_DE_AJUDA)[number]; pontos: number } | null = null;
  for (const artigo of ARTIGOS_DE_AJUDA) {
    const pontos = artigo.palavras.filter((p) => ` ${texto}`.includes(` ${p}`)).length;
    if (pontos > 0 && (!melhor || pontos > melhor.pontos)) melhor = { artigo, pontos };
  }
  return melhor ? { texto: melhor.artigo.resposta, acoes: melhor.artigo.acoes } : null;
}

export function responderNoAssistente(pergunta: string, ctx: ContextoDoAssistente): RespostaDoAssistente {
  const texto = semAcentos(pergunta).replace(/[?!.,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (texto === '') return { texto: 'Pode perguntar! Por exemplo: "quanto gastei com mercado este mês?"', acoes: [] };
  const realizados = ctx.lancamentos.filter((l) => l.status === 'pago');

  // ---- como exportar o extrato de um banco
  if (/(EXPORT|BAIXAR|BAIXO|TIRAR|TIRO|PEGAR|PEGO|EMITIR|GERAR|CONSEGUIR|ACHAR).*(EXTRATO|FATURA|CSV|OFX|PDF)|COMO .*(EXTRATO|FATURA) D/.test(texto)) {
    return responderComoExportar(texto);
  }

  // ---- saldo
  if (/\bSALDO\b|QUANTO (EU )?TENHO|DINHEIRO (EM|NA|NAS) CONTA/.test(texto) && !/LIVRE/.test(texto)) {
    const conta = ctx.contas.find((c) => texto.includes(semAcentos(c.nome)) || (bancoPorTexto(texto) !== null && bancoPorTexto(c.nome) === bancoPorTexto(texto)));
    if (conta) return { texto: `${conta.nome}: ${formatarMoeda(conta.saldo)}.`, acoes: [{ rotulo: 'Ver a conta', href: `/conta-bancaria/${conta.id}` }] };
    const total = ctx.contas.reduce((s, c) => s + c.saldo, 0);
    const linhas = ctx.contas.map((c) => `• ${c.nome}: ${formatarMoeda(c.saldo)}`).join('\n');
    return { texto: `Nas suas contas: ${formatarMoeda(total)}.${linhas ? `\n${linhas}` : ''}`, acoes: [{ rotulo: 'Contas', href: '/conta-bancaria' }] };
  }

  // ---- livre para gastar
  if (/POSSO GASTAR|LIVRE|SOBRA|NEGATIV|NAO FECHA/.test(texto)) {
    const l = ctx.livre;
    const partes = [
      `Entra no mês: ${formatarMoeda(l.receitas)}`,
      `Contas fixas: ${formatarMoeda(l.contasFixas)}`,
      `Faturas: ${formatarMoeda(l.faturas)}`,
      `Gastos fora do cartão: ${formatarMoeda(l.gastos)}`,
      l.guardado !== 0 ? `Guardado: ${formatarMoeda(l.guardado)}` : null,
    ].filter((p): p is string => p !== null);
    const fim =
      l.livre >= 0
        ? `Livre para gastar: ${formatarMoeda(l.livre)}${l.porDia > 0 ? ` (${formatarMoeda(l.porDia)} por dia até o fim do mês)` : ''}.`
        : `Está ${formatarMoeda(-l.livre)} no negativo: saiu (ou vai sair) mais do que entra no mês. Se importou extratos, veja na Agenda se algum pagamento de fatura está contando em dobro.`;
    return { texto: `${partes.join('\n')}\n${fim}`, acoes: [{ rotulo: 'Agenda', href: '/agenda' }] };
  }

  // ---- fatura
  if (/FATURA|CARTAO/.test(texto) && /QUANTO|VALOR|VENC|QUANDO|TA |ESTA|DEVO|PAGAR/.test(texto)) {
    const abertas = ctx.lancamentos
      .filter((l) => l.natureza === 'fatura' && l.status !== 'pago' && l.data >= format(addDays(parseISO(ctx.hoje), -40), 'yyyy-MM-dd'))
      .sort((a, b) => a.data.localeCompare(b.data));
    // "a fatura do C6": só os cartões citados (pelo nome ou pelo banco); sem citar, todos
    const banco = bancoPorTexto(texto);
    const citados = ctx.cartoes.filter((c) => texto.includes(semAcentos(c.nome)) || (banco !== null && bancoPorTexto(c.nome) === banco));
    const doCartao = citados.length > 0 ? abertas.filter((f) => citados.some((c) => c.id === f.cartaoId)) : abertas;
    const lista = (doCartao.length > 0 ? doCartao : abertas).slice(0, 4);
    if (lista.length === 0) return { texto: 'Nenhuma fatura em aberto agora.', acoes: [{ rotulo: 'Cartões', href: '/cartoes' }] };
    const linhas = lista.map((f) => `• ${f.descricao}: ${formatarMoeda(f.valor)}, vence ${formatarData(f.data)}${f.status === 'atrasado' ? ' (atrasada)' : ''}`);
    return { texto: linhas.join('\n'), acoes: [{ rotulo: 'Agenda', href: '/agenda' }, { rotulo: 'Cartões', href: '/cartoes' }] };
  }

  const periodo = periodoDa(texto, ctx.hoje);
  const despesas = realizados.filter((l) => l.natureza === 'despesa' && periodo.filtro(l));

  // ---- maior gasto / para onde foi
  if (/MAIOR(ES)? GASTO|GASTEI MAIS|ONDE (MAIS )?GASTEI|PARA ONDE|PRA ONDE|COM O QUE/.test(texto)) {
    if (despesas.length === 0) return { texto: `Nenhum gasto ${periodo.nome}.`, acoes: [] };
    const maior = [...despesas].sort((a, b) => b.valor - a.valor)[0];
    const top = porCategoria(despesas, ctx.categorias).slice(0, 3);
    return {
      texto: `Maior gasto ${periodo.nome}: ${maior.descricao}, ${formatarMoeda(maior.valor)} (${formatarData(maior.data)}).\nOnde mais foi: ${top
        .map((c) => `${c.nome} ${formatarMoeda(c.total)}`)
        .join(' · ')}.`,
      acoes: [{ rotulo: 'Relatório do mês', href: '/relatorios' }],
    };
  }

  // ---- quanto entrou
  if (/RECEBI|ENTROU|GANHEI|RECEITA|SALARIO|ENTRADA/.test(texto) && !/GAST/.test(texto)) {
    const receitas = realizados.filter((l) => l.natureza === 'receita' && periodo.filtro(l));
    const top = porCategoria(receitas, ctx.categorias).slice(0, 3);
    return {
      texto: `Entrou ${formatarMoeda(somar(receitas))} ${periodo.nome}${top.length > 0 ? `: ${top.map((c) => `${c.nome} ${formatarMoeda(c.total)}`).join(' · ')}` : ''}.`,
      acoes: [{ rotulo: 'Extrato', href: '/lancamentos' }],
    };
  }

  // ---- quanto gastei (com algo)
  if (/GAST|PAGUEI|SAIU|DESPESA/.test(texto)) {
    const assunto = assuntoDa(texto);
    if (assunto) {
      const categoria = ctx.categorias.find((c) => c.tipo === 'despesa' && semAcentos(c.nome).startsWith(assunto)) ??
        ctx.categorias.find((c) => c.tipo === 'despesa' && semAcentos(c.nome).includes(assunto));
      const daCategoria = categoria ? despesas.filter((l) => l.categoriaId === categoria.id) : [];
      const pelaDescricao = despesas.filter((l) => semAcentos(l.descricao).includes(assunto));
      const usados = daCategoria.length > 0 ? daCategoria : pelaDescricao;
      const nome = daCategoria.length > 0 && categoria ? categoria.nome : assunto.toLowerCase();
      if (usados.length === 0) {
        return { texto: `Não achei gastos com "${nome}" ${periodo.nome}.`, acoes: [{ rotulo: 'Buscar lançamentos', href: '/busca' }] };
      }
      return {
        texto: `Com ${nome} ${periodo.nome}: ${formatarMoeda(somar(usados))} em ${usados.length} ${usados.length === 1 ? 'lançamento' : 'lançamentos'}.`,
        acoes: [{ rotulo: 'Buscar lançamentos', href: '/busca' }],
      };
    }
    const top = porCategoria(despesas, ctx.categorias).slice(0, 3);
    return {
      texto: `Você gastou ${formatarMoeda(somar(despesas))} ${periodo.nome}${top.length > 0 ? `. Mais em: ${top.map((c) => `${c.nome} ${formatarMoeda(c.total)}`).join(' · ')}` : ''}.`,
      acoes: [{ rotulo: 'Relatório do mês', href: '/relatorios' }],
    };
  }

  // ---- dúvidas de uso
  const artigo = responderArtigo(texto);
  if (artigo) return artigo;
  if (/^(OI|OLA|BOM DIA|BOA TARDE|BOA NOITE|AJUDA|HELP)\b/.test(texto)) {
    return {
      texto: 'Oi! Eu respondo sobre os seus números ("quanto gastei com mercado?", "qual meu saldo?") e sobre como usar o app ("como importar o extrato?"). Não uso internet nem IA: tudo fica no seu aparelho.',
      acoes: [],
    };
  }
  return {
    texto: 'Não entendi essa. Tente perguntar sobre gastos ("quanto gastei com delivery em setembro?"), saldo, fatura, "quanto posso gastar" ou como fazer algo no app.',
    acoes: [{ rotulo: 'Buscar lançamentos', href: '/busca' }],
  };
}
