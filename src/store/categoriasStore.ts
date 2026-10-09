import { create } from 'zustand';
import * as repo from '@/data/repositories/categoriasRepository';
import type { Categoria } from '@/domain/types/entities';

type CategoriasState = {
  categorias: Categoria[];
  carregando: boolean;
  carregar: () => Promise<void>;
};

export const useCategoriasStore = create<CategoriasState>((set) => ({
  categorias: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const categorias = await repo.listarCategorias();
    set({ categorias, carregando: false });
  },
}));
