import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { Cartao, NovoCartao } from '@/domain/types/entities';
import { pedirReagendamento } from '@/core/notifications/agendador';

const repo = () => repositorios().cartoes;

type CartoesState = {
  cartoes: Cartao[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovoCartao, 'id' | 'ativo'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<Omit<NovoCartao, 'id' | 'ativo'>>) => Promise<void>;
  remover: (id: number) => Promise<void>;
};

export const useCartoesStore = create<CartoesState>((set, get) => ({
  cartoes: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const cartoes = await repo().listarCartoes();
    set({ cartoes, carregando: false });
  },

  criar: async (dados) => {
    await repo().criarCartao(dados);
    await get().carregar();
    pedirReagendamento();
  },

  atualizar: async (id, dados) => {
    await repo().atualizarCartao(id, dados);
    await get().carregar();
    pedirReagendamento();
  },

  remover: async (id) => {
    await repo().desativarCartao(id);
    await get().carregar();
    pedirReagendamento();
  },
}));
