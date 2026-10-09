import { create } from 'zustand';
import * as repo from '@/data/repositories/gastosRapidosRepository';
import type { GastoRapido, NovoGastoRapido } from '@/domain/types/entities';

type GastosRapidosState = {
  gastos: GastoRapido[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovoGastoRapido, 'id'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<Omit<NovoGastoRapido, 'id'>>) => Promise<void>;
  remover: (id: number) => Promise<void>;
  ajustarValor: (id: number, novoValor: number, justificativa: string) => Promise<void>;
};

export const useGastosRapidosStore = create<GastosRapidosState>((set, get) => ({
  gastos: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const gastos = await repo.listarGastosRapidos();
    set({ gastos, carregando: false });
  },

  criar: async (dados) => {
    await repo.criarGastoRapido(dados);
    await get().carregar();
  },

  atualizar: async (id, dados) => {
    await repo.atualizarGastoRapido(id, dados);
    await get().carregar();
  },

  remover: async (id) => {
    await repo.excluirGastoRapido(id);
    await get().carregar();
  },

  ajustarValor: async (id, novoValor, justificativa) => {
    await repo.ajustarValorGasto(id, novoValor, justificativa);
    await get().carregar();
  },
}));
