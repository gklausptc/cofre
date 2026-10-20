import type { Categoria } from '@/domain/types/entities';

export interface CategoriasRepository {
  listarCategorias(): Promise<Categoria[]>;
  /** Cria as categorias padrão se ainda não houver nenhuma. */
  garantirCategoriasPadrao(): Promise<void>;
}
