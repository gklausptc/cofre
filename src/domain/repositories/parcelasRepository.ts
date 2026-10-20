import type { NovaParcela, Parcela } from '@/domain/types/entities';

export type DadosParcela = Omit<NovaParcela, 'id'>;

export interface ParcelasRepository {
  listarParcelas(): Promise<Parcela[]>;
  listarParcelasPorContaFixa(contaFixaId: number): Promise<Parcela[]>;
  listarParcelasPorCompra(compraParceladaId: number): Promise<Parcela[]>;
  inserirParcelas(dados: DadosParcela[]): Promise<Parcela[]>;
  marcarParcelaPaga(id: number, dataPagamento: string): Promise<void>;
  marcarParcelasPagas(ids: number[], dataPagamento: string): Promise<void>;
  /** Altera o valor de uma parcela pendente, guardando o valor de antes e o motivo. */
  ajustarValorParcela(id: number, novoValor: number, justificativa: string): Promise<void>;
}
