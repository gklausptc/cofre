import type { NovoOrcamento, Orcamento } from '@/domain/types/entities';

export type DadosOrcamento = Omit<NovoOrcamento, 'id'>;

export interface OrcamentosRepository {
  listarOrcamentos(): Promise<Orcamento[]>;
  /**
   * Define o limite da categoria: "valer todo mês" a partir de `mesInicio` (substitui o que já
   * começava nesse mês) ou "só neste mês".
   */
  definirOrcamento(dados: DadosOrcamento): Promise<void>;
  /** Tira o orçamento da categoria a partir do mês (os meses anteriores não mudam). */
  removerOrcamento(categoriaId: number, mes: string): Promise<void>;
}
