import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { Categoria } from '@/domain/types/entities';

const repo = () => repositorios().categorias;

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
    const categorias = await repo().listarCategorias();
    set({ categorias, carregando: false });
  },
}));
