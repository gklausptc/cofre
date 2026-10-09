import { create } from 'zustand';
import * as repo from '@/data/repositories/membrosFamiliaRepository';
import type { MembroFamilia } from '@/domain/types/entities';

type MembrosFamiliaState = {
  membros: MembroFamilia[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: { nome: string; cor: string; icone: string }) => Promise<void>;
  remover: (id: number) => Promise<void>;
};

export const useMembrosFamiliaStore = create<MembrosFamiliaState>((set, get) => ({
  membros: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const membros = await repo.listarMembrosFamilia();
    set({ membros, carregando: false });
  },

  criar: async (dados) => {
    await repo.criarMembroFamilia(dados);
    await get().carregar();
  },

  remover: async (id) => {
    await repo.desativarMembroFamilia(id);
    await get().carregar();
  },
}));
