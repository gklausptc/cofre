import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { Categoria } from '@/domain/types/entities';
import type { DadosCategoria } from '@/domain/repositories/categoriasRepository';

const repo = () => repositorios().categorias;

type CategoriasState = {
  categorias: Categoria[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: DadosCategoria) => Promise<Categoria>;
  atualizar: (id: number, dados: Partial<DadosCategoria>) => Promise<void>;
  /** Junta uma categoria em outra (tudo o que era dela passa para a outra) e apaga a primeira. */
  juntar: (origemId: number, destinoId: number) => Promise<void>;
};

export const useCategoriasStore = create<CategoriasState>((set, get) => ({
  categorias: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const categorias = await repo().listarCategorias();
    set({ categorias, carregando: false });
  },

  criar: async (dados) => {
    const criada = await repo().criarCategoria(dados);
    await get().carregar();
    return criada;
  },

  atualizar: async (id, dados) => {
    await repo().atualizarCategoria(id, dados);
    await get().carregar();
  },

  juntar: async (origemId, destinoId) => {
    await repo().juntarCategorias(origemId, destinoId);
    await get().carregar();
  },
}));
