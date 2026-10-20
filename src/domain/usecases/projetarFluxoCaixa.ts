import { addMonths, format, parseISO } from 'date-fns';
import { mesDeCobrancaDaParcela, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import { ehReceita } from '@/domain/usecases/naturezaMovimentacao';
import type { Cartao, CompraParcelada, ContaFixa, GastoRapido, Movimentacao, Parcela } from '@/domain/types/entities';

export type ProjecaoMes = {
  mes: string;
  receitaPrevista: number;
  despesaPrevista: number;
  saldoPrevisto: number;
};

function mesReferenciaDe(data: Date): string {
  return format(data, 'yyyy-MM');
}

/** Mês em que a entrada conta como receita (entradas reservadas contam no mês seguinte). */
function mesEfetivoDaEntrada(mov: Movimentacao): string {
  const mesOriginal = mov.data.slice(0, 7);
  return mov.reservarProximoMes ? mesReferenciaDe(addMonths(parseISO(`${mesOriginal}-01`), 1)) : mesOriginal;
}

/**
 * Receita prevista do mês: entradas marcadas como recorrentes (ex.: salário) valem
 * para todo mês a partir do primeiro lançamento, mais entradas avulsas que caem no
 * próprio mês. As cópias geradas automaticamente são ignoradas — o "modelo" já as
 * representa, então nada é contado em dobro.
 */
function calcularReceitaDoMes(movimentacoes: Movimentacao[], mes: string): number {
  return movimentacoes
    .filter((m) => ehReceita(m) && m.recorrenteOrigemId === null)
    .filter((m) => {
      const mesEfetivo = mesEfetivoDaEntrada(m);
      return m.recorrente ? mesEfetivo <= mes : mesEfetivo === mes;
    })
    .reduce((soma, m) => soma + m.valor, 0);
}

/**
 * Projeta receita/despesa/saldo dos próximos meses. Despesa vem das `parcelas`
 * pendentes (contas fixas + compras parceladas no cartão) e dos gastos já feitos no cartão.
 */
export function projetarFluxoCaixa(
  mesesAFrente: number,
  parcelas: Parcela[],
  movimentacoes: Movimentacao[],
  gastos: GastoRapido[] = [],
  contasFixas: ContaFixa[] = [],
  comprasParceladas: CompraParcelada[] = [],
  cartoes: Cartao[] = [],
  hoje: Date = new Date()
): ProjecaoMes[] {
  const contasPorId = new Map(contasFixas.map((c) => [c.id, c]));
  const comprasPorId = new Map(comprasParceladas.map((c) => [c.id, c]));
  const cartoesPorId = new Map(cartoes.map((c) => [c.id, c]));
  return Array.from({ length: mesesAFrente }, (_, i) => {
    const mes = mesReferenciaDe(addMonths(hoje, i));
    const receitaPrevista = calcularReceitaDoMes(movimentacoes, mes);
    const despesaParcelas = parcelas
      .filter((p) =>
          p.status === 'pendente' && mesDeCobrancaDaParcela(p, contasPorId, comprasPorId, cartoesPorId) === mes)
      .reduce((soma, p) => soma + p.valor, 0);
    const despesaCartao = gastos
      .filter((g) => g.formaPagamento === 'cartao' && mesDeCobrancaDoGasto(g, cartoesPorId) === mes)
      .reduce((soma, g) => soma + g.valor, 0);
    const despesaPrevista = despesaParcelas + despesaCartao;

    return {
      mes,
      receitaPrevista,
      despesaPrevista,
      saldoPrevisto: receitaPrevista - despesaPrevista,
    };
  });
}
