import { differenceInCalendarMonths, parseISO } from 'date-fns';
import { formatarMoeda } from '@/core/utils/currency';
import { mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import { semelhanca } from './deduplicar';
import { normalizarDescricao } from './normalizarDescricao';
import { textoParaRegra, type Categorizacao } from './categorizar';
import type { CompraParcelada, ContaFixa, GastoRapido, Movimentacao, Parcela, RegraCategorizacao } from '@/domain/types/entities';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import type { DiasDoCartao } from './analisarImportacao';
import type { MarcaParcela, TransacaoLida } from './tipos';

/** Uma linha que vai ser gravada, com o que a análise sabe dela. */
export type LinhaGravada = {
  transacao: TransacaoLida;
  onde: 'movimentacao' | 'gasto';
  categoriaId: number | null;
  membroId: number | null;
  categorizacao: Categorizacao | null;
};

// ------------------------------------------------------------------ parcelamento

export type ParcelamentoDetectado = {
  linha: LinhaGravada;
  marca: MarcaParcela;
  /** Descrição sem a marca de parcela e sem "(compra em …)". */
  descricao: string;
  mesDaFatura: string;
};

/**
 * Compras parceladas na fatura do cartão ("LOJA 03/10") que ainda não existem no app como
 * compra parcelada. A última parcela (10/10) não vira pergunta: não falta nada.
 */
export function detectarParcelamentos(
  linhas: LinhaGravada[],
  destino: DestinoImportacao,
  cartao: DiasDoCartao | null,
  mesDaFatura: string | null,
  compras: Pick<CompraParcelada, 'id' | 'cartaoId' | 'descricao' | 'numParcelas' | 'valorTotal' | 'ativo'>[],
  parcelas: Pick<Parcela, 'compraParceladaId' | 'valor'>[]
): ParcelamentoDetectado[] {
  if (destino.tipo !== 'cartao' || !cartao) return [];
  const cartoes = new Map([[cartao.id, cartao]]);
  const valoresPorCompra = new Map<number, number[]>();
  for (const p of parcelas) {
    if (p.compraParceladaId === null) continue;
    const lista = valoresPorCompra.get(p.compraParceladaId) ?? [];
    lista.push(p.valor);
    valoresPorCompra.set(p.compraParceladaId, lista);
  }

  const detectados: ParcelamentoDetectado[] = [];
  for (const linha of linhas) {
    const t = linha.transacao;
    const marca = t.parcela ?? normalizarDescricao(t.descricao).parcela;
    if (!marca || marca.numero >= marca.total || t.valor <= 0) continue;
    const descricao = limparDescricaoDaParcela(t.descricao);
    const jaExiste = compras.some(
      (c) =>
        c.ativo !== false &&
        c.cartaoId === destino.cartaoId &&
        c.numParcelas === marca.total &&
        (valoresPorCompra.get(c.id) ?? [Math.round(c.valorTotal / c.numParcelas)]).some((v) => Math.abs(v - t.valor) <= 2) &&
        semelhanca(c.descricao, descricao) >= 0.5
    );
    if (jaExiste) continue;
    detectados.push({
      linha,
      marca,
      descricao,
      mesDaFatura: mesDaFatura ?? mesDeCobrancaDoGasto({ data: t.data, formaPagamento: 'cartao', cartaoId: cartao.id }, cartoes),
    });
  }
  return detectados;
}

/** "LOJA X PARC 03/10 (compra em 05/06/2026)" → "LOJA X". */
export function limparDescricaoDaParcela(descricao: string): string {
  return descricao
    .replace(/\s*\(compra em [^)]*\)\s*$/i, '')
    .replace(/\s*-?\s*\b(PARC(ELA)?\.?\s*)?\d{1,2}\s*(\/|DE)\s*\d{1,2}\s*$/i, '')
    .trim();
}

// ------------------------------------------------------------------ recorrência

export type RecorrenciaDetectada = {
  chave: string;
  nome: string;
  padrao: string;
  valor: number;
  dia: number;
  meses: string[];
  assinatura: boolean;
  linhas: LinhaGravada[];
};

/** Lançamento antigo, de qualquer conta ou cartão, para procurar repetição. */
type Ocorrencia = { chave: string; data: string; valor: number };

export const MESES_PARA_RECORRENCIA = 3;
const TOLERANCIA_VALOR = 0.1;
const TOLERANCIA_DIA = 5;

const mediana = (valores: number[]) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
};

/**
 * Despesas que se repetem: mesmo comerciante ou pessoa, valor ±10%, perto do mesmo dia, em
 * pelo menos 3 meses seguidos (somando o extrato e o que já está no app). Comerciante que
 * aparece muitas vezes no mês (Uber, iFood) não conta: conta fixa aparece uma vez por mês.
 * Fica de fora o que já é conta fixa (nome parecido, ou regra de conta fixa para o texto).
 */
export function detectarRecorrencias(params: {
  linhas: LinhaGravada[];
  /** Chave de agrupamento de uma descrição (comerciante, pessoa do PIX ou texto). */
  chaveDe: (descricao: string) => { chave: string; nome: string; assinatura: boolean };
  movimentacoes: Pick<Movimentacao, 'tipo' | 'descricao' | 'data' | 'valor' | 'origem' | 'faturaId' | 'parcelaId' | 'idExterno'>[];
  gastos: Pick<GastoRapido, 'descricao' | 'data' | 'valor' | 'idExterno'>[];
  contasFixas: Pick<ContaFixa, 'nome' | 'valor' | 'ativo'>[];
  regras: Pick<RegraCategorizacao, 'padrao' | 'acao'>[];
}): RecorrenciaDetectada[] {
  const { linhas, chaveDe } = params;
  const temParcela = (descricao: string) => normalizarDescricao(descricao).parcela !== null || /\(compra em /i.test(descricao);
  // parcela de compra se repete todo mês, mas é compra parcelada, não conta fixa
  const despesas = linhas.filter(
    (l) =>
      (l.onde === 'gasto' ? l.transacao.valor > 0 : l.transacao.valor < 0) &&
      l.transacao.parcela === null &&
      !temParcela(l.transacao.descricao)
  );
  if (despesas.length === 0) return [];

  const idsDoExtrato = new Set(linhas.map((l) => l.transacao.idExterno));
  const historico: Ocorrencia[] = [];
  for (const m of params.movimentacoes) {
    if (m.tipo !== 'saida' || m.origem !== 'manual' || m.faturaId !== null || m.parcelaId !== null || !m.descricao) continue;
    if ((m.idExterno && idsDoExtrato.has(m.idExterno)) || temParcela(m.descricao)) continue;
    historico.push({ chave: chaveDe(m.descricao).chave, data: m.data, valor: m.valor });
  }
  for (const g of params.gastos) {
    if (!g.descricao || (g.idExterno && idsDoExtrato.has(g.idExterno)) || temParcela(g.descricao)) continue;
    historico.push({ chave: chaveDe(g.descricao).chave, data: g.data, valor: g.valor });
  }

  const grupos = new Map<string, { nome: string; assinatura: boolean; linhas: LinhaGravada[] }>();
  for (const linha of despesas) {
    const { chave, nome, assinatura } = chaveDe(linha.transacao.descricao);
    if (chave === '') continue;
    const grupo = grupos.get(chave) ?? { nome, assinatura, linhas: [] };
    grupo.linhas.push(linha);
    grupos.set(chave, grupo);
  }

  const padroesDeContaFixa = params.regras.filter((r) => r.acao === 'conta_fixa').map((r) => r.padrao);
  const detectadas: RecorrenciaDetectada[] = [];

  for (const [chave, grupo] of grupos) {
    const ocorrencias: Ocorrencia[] = [
      ...grupo.linhas.map((l) => ({ chave, data: l.transacao.data, valor: Math.abs(l.transacao.valor) })),
      ...historico.filter((h) => h.chave === chave),
    ];
    const recente = [...grupo.linhas].sort((a, b) => b.transacao.data.localeCompare(a.transacao.data))[0];
    const referencia = Math.abs(recente.transacao.valor);

    const porMes = new Map<string, Ocorrencia[]>();
    for (const o of ocorrencias) {
      const mes = o.data.slice(0, 7);
      porMes.set(mes, [...(porMes.get(mes) ?? []), o]);
    }
    // muitas vezes no mês: não é conta fixa
    if ([...porMes.values()].some((lista) => lista.length > 2)) continue;

    const parecidas = ocorrencias.filter((o) => Math.abs(o.valor - referencia) <= Math.max(100, referencia * TOLERANCIA_VALOR));
    const diaTipico = mediana(parecidas.map((o) => Number(o.data.slice(8, 10))));
    const meses = [
      ...new Set(
        parecidas.filter((o) => Math.abs(Number(o.data.slice(8, 10)) - diaTipico) <= TOLERANCIA_DIA).map((o) => o.data.slice(0, 7))
      ),
    ].sort();
    const seguidos = maiorSequenciaDeMeses(meses);
    if (seguidos.length < MESES_PARA_RECORRENCIA) continue;

    const padrao = textoParaRegra(recente.transacao.descricao);
    const jaEContaFixa =
      params.contasFixas.some(
        (cf) =>
          cf.ativo !== false &&
          (semelhanca(cf.nome, grupo.nome) >= 0.6 || semelhanca(cf.nome, recente.transacao.descricao) >= 0.6) &&
          Math.abs(cf.valor - referencia) <= referencia * 0.2
      ) || padroesDeContaFixa.some((p) => p !== '' && ` ${padrao} `.includes(` ${p} `));
    if (jaEContaFixa) continue;

    detectadas.push({
      chave,
      nome: grupo.nome,
      padrao,
      valor: referencia,
      dia: diaTipico,
      meses: seguidos,
      assinatura: grupo.assinatura,
      linhas: grupo.linhas,
    });
  }
  return detectadas;
}

/** Maior sequência de meses seguidos ('YYYY-MM' já ordenados). */
export function maiorSequenciaDeMeses(meses: string[]): string[] {
  let melhor: string[] = [];
  let atual: string[] = [];
  for (const mes of meses) {
    const anterior = atual[atual.length - 1];
    if (anterior && differenceInCalendarMonths(parseISO(`${mes}-01`), parseISO(`${anterior}-01`)) === 1) {
      atual.push(mes);
    } else {
      atual = [mes];
    }
    if (atual.length > melhor.length) melhor = [...atual];
  }
  return melhor;
}

/** "Netflix: R$ 55,90 todo dia 12 há 3 meses · parece assinatura". */
export function pistaDaRecorrencia(r: Pick<RecorrenciaDetectada, 'nome' | 'valor' | 'dia' | 'meses' | 'assinatura'>): string {
  return `${r.nome}: ${formatarMoeda(r.valor)} todo dia ${r.dia} há ${r.meses.length} meses${r.assinatura ? ' · parece assinatura' : ''}`;
}
