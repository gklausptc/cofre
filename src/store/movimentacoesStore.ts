import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { Movimentacao, NovaMovimentacao } from '@/domain/types/entities';
import { pedirReagendamento } from '@/core/notifications/agendador';

const repo = () => repositorios().movimentacoes;

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
    const movimentacoes = await repo().listarMovimentacoes();
    set({ movimentacoes, carregando: false });
  },

  criar: async (dados) => {
    await repo().criarMovimentacao(dados);
    await get().carregar();
    pedirReagendamento();
  },

  atualizar: async (id, dados) => {
    await repo().atualizarMovimentacao(id, dados);
    await get().carregar();
    pedirReagendamento();
  },

  remover: async (id) => {
    await repo().excluirMovimentacao(id);
    await get().carregar();
    pedirReagendamento();
  },
}));
