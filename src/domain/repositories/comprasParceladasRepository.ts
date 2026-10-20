import type { CompraParcelada, NovaCompraParcelada } from '@/domain/types/entities';

export type DadosCompraParcelada = Omit<NovaCompraParcelada, 'id' | 'ativo'>;

export type DadosEdicaoCompra = {
  descricao: string;
  valorTotal: number;
  numParcelas: number;
  dataCompra: string;
  /** Mês de fechamento da fatura da 1ª parcela ('YYYY-MM'). */
  mesPrimeiraParcela: string;
  categoriaId: number | null;
  membroId: number | null;
};

export interface ComprasParceladasRepository {
  /** Só as ativas. */
  listarComprasParceladas(): Promise<CompraParcelada[]>;
  listarComprasPorCartao(cartaoId: number): Promise<CompraParcelada[]>;
  /** Cria a compra e as parcelas dela (ver gerarParcelas). */
  criarCompraParcelada(dados: DadosCompraParcelada, mesPrimeiraParcela?: string): Promise<CompraParcelada>;
  /**
   * Edita a compra e recalcula só as parcelas pendentes (ver editarParcelamento).
   * Lança erro com a mensagem da regra de negócio se a edição for inválida.
   */
  editarCompraParcelada(id: number, dados: DadosEdicaoCompra): Promise<void>;
}
