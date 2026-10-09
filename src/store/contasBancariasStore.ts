import { create } from 'zustand';
import * as repo from '@/data/repositories/contasBancariasRepository';
import type { ContaBancaria, NovaContaBancaria } from '@/domain/types/entities';

type ContasBancariasState = {
  contas: ContaBancaria[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovaContaBancaria, 'id' | 'ativo'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<NovaContaBancaria>) => Promise<void>;
  remover: (id: number) => Promise<void>;
};

export const useContasBancariasStore = create<ContasBancariasState>((set, get) => ({
  contas: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const contas = await repo.listarContasBancarias();
    set({ contas, carregando: false });
  },

  criar: async (dados) => {
    await repo.criarContaBancaria(dados);
    await get().carregar();
  },

  atualizar: async (id, dados) => {
    await repo.atualizarContaBancaria(id, dados);
    await get().carregar();
  },

  remover: async (id) => {
    await repo.desativarContaBancaria(id);
    await get().carregar();
  },
}));
