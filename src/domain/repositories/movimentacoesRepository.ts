import type { Movimentacao, NovaMovimentacao } from '@/domain/types/entities';

export type DadosMovimentacao = Omit<NovaMovimentacao, 'id'>;

/** A que compromisso uma saída de pagamento está ligada. */
export type VinculoPagamento = { faturaId: number } | { parcelaId: number };

export interface MovimentacoesRepository {
  /** Da mais recente para a mais antiga. */
  listarMovimentacoes(): Promise<Movimentacao[]>;
  listarMovimentacoesPorConta(contaBancariaId: number): Promise<Movimentacao[]>;
  buscarMovimentacao(id: number): Promise<Movimentacao | null>;
  criarMovimentacao(dados: DadosMovimentacao): Promise<Movimentacao>;
  inserirMovimentacoes(dados: DadosMovimentacao[]): Promise<Movimentacao[]>;
  atualizarMovimentacao(id: number, dados: Partial<DadosMovimentacao>): Promise<Movimentacao>;
  excluirMovimentacao(id: number): Promise<void>;
  /**
   * Troca a saída ligada à fatura/parcela pela nova (ou só apaga a antiga, se `dados` for
   * null). Assim pagar de novo, ou mudar a conta do pagamento, nunca cria duas saídas.
   */
  registrarPagamentoVinculado(vinculo: VinculoPagamento, dados: DadosMovimentacao | null): Promise<void>;
}
