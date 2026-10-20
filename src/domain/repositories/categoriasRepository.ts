import type { Categoria, NovaCategoria } from '@/domain/types/entities';

export type DadosCategoria = Omit<NovaCategoria, 'id'>;

export interface CategoriasRepository {
  listarCategorias(): Promise<Categoria[]>;
  /** Cria as categorias padrão (banco vazio) ou só as das levas novas (banco antigo). */
  garantirCategoriasPadrao(): Promise<void>;
  criarCategoria(dados: DadosCategoria): Promise<Categoria>;
  atualizarCategoria(id: number, dados: Partial<DadosCategoria>): Promise<void>;
  /**
   * Junta `origemId` em `destinoId`: lançamentos, contas fixas, compras, regras, contatos e
   * orçamentos passam para o destino e a origem é apagada (numa transação).
   */
  juntarCategorias(origemId: number, destinoId: number): Promise<void>;
}
