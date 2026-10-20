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
  /** Registra (ou atualiza) a fatura do cartão/mês como paga. */
  registrarPagamentoFatura(dados: PagamentoFatura): Promise<void>;
}
