import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { Cofrinho, NovoCofrinho } from '@/domain/types/entities';

const repo = () => repositorios().cofrinhos;

type CofrinhosState = {
  cofrinhos: Cofrinho[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovoCofrinho, 'id' | 'status'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<Omit<NovoCofrinho, 'id' | 'status'>>) => Promise<void>;
  remover: (id: number) => Promise<void>;
};

export const useCofrinhosStore = create<CofrinhosState>((set, get) => ({
  cofrinhos: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const cofrinhos = await repo().listarCofrinhos();
    set({ cofrinhos, carregando: false });
  },

  criar: async (dados) => {
    await repo().criarCofrinho(dados);
    await get().carregar();
  },

  atualizar: async (id, dados) => {
    await repo().atualizarCofrinho(id, dados);
    await get().carregar();
  },

  remover: async (id) => {
    await repo().removerCofrinho(id);
    await get().carregar();
  },
}));
