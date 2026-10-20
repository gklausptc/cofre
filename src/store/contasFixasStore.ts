import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { ContaFixa, NovaContaFixa } from '@/domain/types/entities';

const repo = () => repositorios().contasFixas;

type ContasFixasState = {
  contas: ContaFixa[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovaContaFixa, 'id' | 'ativo'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<NovaContaFixa>) => Promise<void>;
  remover: (id: number) => Promise<void>;
};

export const useContasFixasStore = create<ContasFixasState>((set, get) => ({
  contas: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const contas = await repo().listarContasFixas();
    set({ contas, carregando: false });
  },

  criar: async (dados) => {
    await repo().criarContaFixa(dados);
    await get().carregar();
  },

  atualizar: async (id, dados) => {
    await repo().atualizarContaFixa(id, dados);
    await get().carregar();
  },

  remover: async (id) => {
    await repo().desativarContaFixa(id);
    await get().carregar();
  },
}));
