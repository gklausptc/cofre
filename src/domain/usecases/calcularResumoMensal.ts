import { mesAnterior } from '@/core/utils/date';
import type { GastoRapido, Movimentacao, Parcela } from '@/domain/types/entities';

export type ResumoMensal = {
  receitas: number;
  despesas: number;
  saldo: number;
  reservadoParaEsteMes: number;
};

/**
 * Resumo de entradas x saídas do mês (inclui gastos rápidos, que não passam por
 * conta bancária). Diferente do saldo em conta: aqui é "quanto ganhei/gastei",
 * não "quanto tenho guardado".
 *
 * Também entram em "saiu" as contas fixas e parcelas de cartão já marcadas como
 * pagas (no mês do pagamento) — assim o resumo acompanha o que você realmente pagou.
 *
 * Entradas marcadas com `reservarProximoMes` (ex.: salário recebido no fim do mês
 * mas destinado a cobrir o mês seguinte) não entram no resumo do mês em que
 * caíram — entram no resumo do mês seguinte, evitando um "saldo negativo" falso.
 */
export function calcularResumoMensal(
  movimentacoes: Movimentacao[],
  gastos: GastoRapido[],
  mesReferencia: string,
  parcelas: Parcela[] = []
): ResumoMensal {
  const mesAnteriorRef = mesAnterior(mesReferencia);

  const receitasDoMes = movimentacoes
    .filter((m) => m.tipo === 'entrada' && m.data.startsWith(mesReferencia) && !m.reservarProximoMes)
    .reduce((soma, m) => soma + m.valor, 0);

  const reservadoParaEsteMes = movimentacoes
    .filter((m) => m.tipo === 'entrada' && m.reservarProximoMes && m.data.startsWith(mesAnteriorRef))
    .reduce((soma, m) => soma + m.valor, 0);

  const receitas = receitasDoMes + reservadoParaEsteMes;

  const despesasMovimentacoes = movimentacoes
    .filter((m) => m.tipo === 'saida' && m.data.startsWith(mesReferencia))
    .reduce((soma, m) => soma + m.valor, 0);

  const despesasGastosRapidos = gastos
    .filter((g) => g.data.startsWith(mesReferencia))
    .reduce((soma, g) => soma + g.valor, 0);

  const despesasParcelasPagas = parcelas
    .filter((p) => p.status === 'paga' && (p.dataPagamento ?? p.mesReferencia).startsWith(mesReferencia))
    .reduce((soma, p) => soma + p.valor, 0);

  const despesas = despesasMovimentacoes + despesasGastosRapidos + despesasParcelasPagas;

  return { receitas, despesas, saldo: receitas - despesas, reservadoParaEsteMes };
}
