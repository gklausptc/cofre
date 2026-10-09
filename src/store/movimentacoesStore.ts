import { create } from 'zustand';
import * as repo from '@/data/repositories/movimentacoesRepository';
import type { Movimentacao, NovaMovimentacao } from '@/domain/types/entities';

type MovimentacoesState = {
  movimentacoes: Movimentacao[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovaMovimentacao, 'id'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<Omit<NovaMovimentacao, 'id'>>) => Promise<void>;
  remover: (id: number) => Promise<void>;
};

export const useMovimentacoesStore = create<MovimentacoesState>((set, get) => ({
  movimentacoes: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const movimentacoes = await repo.listarMovimentacoes();
    set({ movimentacoes, carregando: false });
  },

  criar: async (dados) => {
    await repo.criarMovimentacao(dados);
    await get().carregar();
  },

  atualizar: async (id, dados) => {
    await repo.atualizarMovimentacao(id, dados);
    await get().carregar();
  },

  remover: async (id) => {
    await repo.excluirMovimentacao(id);
    await get().carregar();
  },
}));
