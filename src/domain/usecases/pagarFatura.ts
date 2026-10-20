import { dataFechamentoDaFatura, dataNoMes } from '@/domain/usecases/mesDaFatura';
import type { PagamentoFatura } from '@/domain/repositories/faturasRepository';
import type { Cartao } from '@/domain/types/entities';

export type PedidoPagamentoFatura = {
  cartao: Pick<Cartao, 'id' | 'diaFechamento' | 'diaVencimento'>;
  /** Mês de vencimento da fatura ('YYYY-MM'). */
  mesReferencia: string;
  /** Em centavos. */
  valorPago: number;
  parcelaIds: number[];
  /** Conta de onde saiu o dinheiro; null = "não descontar de conta". */
  contaBancariaId: number | null;
};

export type PlanoPagamentoFatura = {
  parcelasAPagar: number[];
  dataPagamento: string;
  registro: PagamentoFatura;
};

/**
 * O que gravar ao pagar uma fatura: dar baixa nas parcelas dela e registrar a fatura
 * do cartão/mês como paga, com as datas de fechamento e vencimento do cartão.
 */
export function planejarPagamentoFatura(pedido: PedidoPagamentoFatura, hojeIso: string): PlanoPagamentoFatura {
  const { cartao, mesReferencia } = pedido;
  return {
    parcelasAPagar: [...new Set(pedido.parcelaIds)],
    dataPagamento: hojeIso,
    registro: {
      cartaoId: cartao.id,
      mesReferencia,
      dataFechamento: dataFechamentoDaFatura(mesReferencia, cartao),
      dataVencimento: dataNoMes(mesReferencia, cartao.diaVencimento),
      contaBancariaId: pedido.contaBancariaId,
      valorPago: pedido.valorPago,
      dataPagamento: hojeIso,
    },
  };
}
