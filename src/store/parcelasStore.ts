import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { Parcela } from '@/domain/types/entities';
import { hojeIso } from '@/core/utils/date';

const repo = () => repositorios().parcelas;

type ParcelasState = {
  parcelas: Parcela[];
  carregando: boolean;
  carregar: () => Promise<void>;
  marcarPaga: (id: number) => Promise<void>;
  ajustarValor: (id: number, novoValor: number, justificativa: string) => Promise<void>;
};

export const useParcelasStore = create<ParcelasState>((set, get) => ({
  parcelas: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const parcelas = await repo().listarParcelas();
    set({ parcelas, carregando: false });
  },

  marcarPaga: async (id) => {
    await repo().marcarParcelaPaga(id, hojeIso());
    await get().carregar();
  },

  ajustarValor: async (id, novoValor, justificativa) => {
    await repo().ajustarValorParcela(id, novoValor, justificativa);
    await get().carregar();
  },
}));
