import { differenceInCalendarDays, parseISO } from 'date-fns';
import { mesAnterior } from '@/core/utils/date';
import { ehDespesa, ehPagamentoDeCompromisso } from '@/domain/usecases/naturezaMovimentacao';
import { textoParaRegra } from './categorizar';
import type { EfeitosDaImportacao } from '@/domain/repositories/importacoesRepository';
import type { Categoria, GastoRapido, Importacao, Movimentacao } from '@/domain/types/entities';

/** Um gasto ou entrada de qualquer origem, para somar e comparar. */
type Lancamento = {
  id: string;
  descricao: string;
  data: string;
  valor: number;
  categoriaId: number | null;
  importacaoId: number | null;
};

export type GastoForaDoPadrao = {
  id: string;
  descricao: string;
  valor: number;
  /** Média do que serviu de comparação. */
  media: number;
  /** "62% acima do normal para Conta de luz". */
  motivo: string;
};

export type CategoriaDoResultado = { categoriaId: number | null; nome: string; cor: string; total: number };

export type ResultadoDaImportacao = {
  /** Mês com mais lançamentos importados ('YYYY-MM'). */
  mes: string | null;
  entradas: number;
  /** Despesas de verdade (sem pagamentos de fatura/conta fixa nem transferências). */
  saidas: number;
  /** Pagamentos de fatura e contas fixas: saem do saldo, mas não são gasto novo. */
  pagamentos: number;
  transferencias: number;
  porCategoria: CategoriaDoResultado[];
  /** Despesas do mês (todos os lançamentos do app) e do mês anterior. */
  comparacao: { mes: string; total: number; anterior: number } | null;
  foraDoPadrao: GastoForaDoPadrao[];
  contasFixasPagas: number;
  faturasPagas: number;
};

function despesasDoApp(movimentacoes: Movimentacao[], gastos: GastoRapido[]): Lancamento[] {
  return [
    ...movimentacoes.filter((m) => ehDespesa(m)).map((m) => ({
      id: `mov-${m.id}`,
      descricao: m.descricao ?? '',
      data: m.data,
      valor: m.valor,
      categoriaId: m.categoriaId,
      importacaoId: m.importacaoId,
    })),
    ...gastos.map((g) => ({
      id: `gasto-${g.id}`,
      descricao: g.descricao ?? '',
      data: g.data,
      valor: g.valor,
      categoriaId: g.categoriaId,
      importacaoId: g.importacaoId,
    })),
  ];
}

const media = (valores: number[]) => valores.reduce((s, v) => s + v, 0) / valores.length;

/**
 * Gastos importados muito acima do normal: o mesmo comerciante 50% acima da média (e pelo
 * menos R$ 50 a mais), ou a mesma categoria com o triplo da média por lançamento (e pelo
 * menos R$ 100 a mais), olhando os 90 dias antes.
 */
export function detectarForaDoPadrao(
  importados: Lancamento[],
  historico: Lancamento[],
  nomeDaCategoria: (id: number | null) => string
): GastoForaDoPadrao[] {
  const sinalizados: GastoForaDoPadrao[] = [];
  for (const l of importados) {
    const antes = historico.filter((h) => {
      if (h.importacaoId !== null && h.importacaoId === l.importacaoId) return false;
      const dias = differenceInCalendarDays(parseISO(l.data), parseISO(h.data));
      return dias > 0 && dias <= 90;
    });
    const texto = textoParaRegra(l.descricao);
    const mesmoComerciante = texto === '' ? [] : antes.filter((h) => textoParaRegra(h.descricao) === texto);
    if (mesmoComerciante.length >= 2) {
      const m = media(mesmoComerciante.map((h) => h.valor));
      if (l.valor >= m * 1.5 && l.valor - m >= 5000) {
        sinalizados.push({ id: l.id, descricao: l.descricao, valor: l.valor, media: Math.round(m), motivo: `${Math.round((l.valor / m - 1) * 100)}% acima do normal` });
      }
      continue;
    }
    if (l.categoriaId === null) continue;
    const mesmaCategoria = antes.filter((h) => h.categoriaId === l.categoriaId);
    if (mesmaCategoria.length < 3) continue;
    const m = media(mesmaCategoria.map((h) => h.valor));
    if (l.valor >= m * 3 && l.valor - m >= 10000) {
      sinalizados.push({
        id: l.id,
        descricao: l.descricao,
        valor: l.valor,
        media: Math.round(m),
        motivo: `${Math.round(l.valor / m)}× o normal em ${nomeDaCategoria(l.categoriaId)}`,
      });
    }
  }
  return sinalizados.sort((a, b) => b.valor - a.valor);
}

/** Números da tela de resultado de uma importação (o que entrou, por categoria, comparação, fora do padrão). */
export function resumirImportacao(params: {
  importacao: Pick<Importacao, 'id' | 'efeitos'>;
  movimentacoes: Movimentacao[];
  gastos: GastoRapido[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'cor'>[];
}): ResultadoDaImportacao {
  const { importacao, movimentacoes, gastos, categorias } = params;
  const movsDaImportacao = movimentacoes.filter((m) => m.importacaoId === importacao.id);
  const gastosDaImportacao = gastos.filter((g) => g.importacaoId === importacao.id);
  const todasDespesas = despesasDoApp(movimentacoes, gastos);
  const importadas = todasDespesas.filter((d) => d.importacaoId === importacao.id);

  const porId = new Map(categorias.map((c) => [c.id, c]));
  const nomeDaCategoria = (id: number | null) => (id !== null ? (porId.get(id)?.nome ?? 'Sem categoria') : 'Sem categoria');

  const totais = new Map<number | null, number>();
  for (const d of importadas) totais.set(d.categoriaId, (totais.get(d.categoriaId) ?? 0) + d.valor);
  const porCategoria = [...totais]
    .map(([categoriaId, total]) => ({
      categoriaId,
      nome: nomeDaCategoria(categoriaId),
      cor: categoriaId !== null ? (porId.get(categoriaId)?.cor ?? '#8891A6') : '#8891A6',
      total,
    }))
    .sort((a, b) => b.total - a.total);

  const datas = [...movsDaImportacao.map((m) => m.data), ...gastosDaImportacao.map((g) => g.data)];
  const contagem = new Map<string, number>();
  for (const data of datas) contagem.set(data.slice(0, 7), (contagem.get(data.slice(0, 7)) ?? 0) + 1);
  const mes = [...contagem].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;

  const totalDoMes = (m: string) => todasDespesas.filter((d) => d.data.startsWith(m)).reduce((s, d) => s + d.valor, 0);
  const efeitos: EfeitosDaImportacao | null = importacao.efeitos ? (JSON.parse(importacao.efeitos) as EfeitosDaImportacao) : null;

  return {
    mes,
    entradas: movsDaImportacao.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0),
    saidas: importadas.reduce((s, d) => s + d.valor, 0),
    pagamentos: movsDaImportacao.filter((m) => m.tipo === 'saida' && ehPagamentoDeCompromisso(m)).reduce((s, m) => s + m.valor, 0),
    transferencias: movsDaImportacao.filter((m) => m.tipo === 'transferencia').length + (efeitos?.movimentacoes.length ?? 0),
    porCategoria,
    comparacao: mes ? { mes, total: totalDoMes(mes), anterior: totalDoMes(mesAnterior(mes)) } : null,
    foraDoPadrao: detectarForaDoPadrao(importadas, todasDespesas, nomeDaCategoria),
    contasFixasPagas: movsDaImportacao.filter((m) => m.origem === 'conta_fixa' && m.parcelaId !== null).length,
    faturasPagas: movsDaImportacao.filter((m) => m.origem === 'fatura').length,
  };
}

/**
 * Importações mais novas que mexeram em linhas desta (o outro lado de uma transferência, ou
 * gastos desta que viraram parcelas de uma compra criada lá): desfazer esta antes delas
 * deixaria saldos e faturas errados.
 */
export function importacoesQueDependem(
  importacaoId: number,
  idsDasMovimentacoes: number[],
  outras: Pick<Importacao, 'id' | 'arquivo' | 'efeitos'>[]
): Pick<Importacao, 'id' | 'arquivo'>[] {
  const ids = new Set(idsDasMovimentacoes);
  return outras.filter((o) => {
    if (o.id === importacaoId || !o.efeitos) return false;
    const efeitos = JSON.parse(o.efeitos) as EfeitosDaImportacao;
    return (
      efeitos.movimentacoes.some((m) => ids.has(m.id)) ||
      (efeitos.gastosApagados ?? []).some((g) => g.importacaoId === importacaoId)
    );
  });
}
