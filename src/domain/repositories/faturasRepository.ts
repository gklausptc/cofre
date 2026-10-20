import type { Fatura } from '@/domain/types/entities';

export type PagamentoFatura = {
  cartaoId: number;
  mesReferencia: string;
  dataFechamento: string;
  dataVencimento: string;
  contaBancariaId: number | null;
  valorPago: number;
  dataPagamento: string;
};

export interface FaturasRepository {
  listarFaturas(): Promise<Fatura[]>;
  /** Registra (ou atualiza) a fatura do cartão/mês como paga e devolve o id dela. */
  registrarPagamentoFatura(dados: PagamentoFatura): Promise<number>;
  /**
   * Dá baixa na fatura (e nas parcelas dela) numa transação. Com `movimentacaoId`, a saída da
   * conta que já estava no app vira o pagamento dessa fatura (deixa de contar como gasto); sem
   * ela, a fatura só é marcada como paga (pagamento fora do app).
   */
  ligarPagamento(dados: { pagamento: PagamentoFatura; parcelaIds: number[]; movimentacaoId: number | null }): Promise<void>;
}
