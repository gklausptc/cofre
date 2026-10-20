import type { Movimentacao, NovaMovimentacao } from '@/domain/types/entities';

export type DadosMovimentacao = Omit<NovaMovimentacao, 'id'>;

export interface MovimentacoesRepository {
  /** Da mais recente para a mais antiga. */
  listarMovimentacoes(): Promise<Movimentacao[]>;
  listarMovimentacoesPorConta(contaBancariaId: number): Promise<Movimentacao[]>;
  buscarMovimentacao(id: number): Promise<Movimentacao | null>;
  criarMovimentacao(dados: DadosMovimentacao): Promise<Movimentacao>;
  inserirMovimentacoes(dados: DadosMovimentacao[]): Promise<Movimentacao[]>;
  atualizarMovimentacao(id: number, dados: Partial<DadosMovimentacao>): Promise<Movimentacao>;
  excluirMovimentacao(id: number): Promise<void>;
}
