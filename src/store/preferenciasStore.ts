import { create } from 'zustand';
import * as repo from '@/data/repositories/preferenciasRepository';
import type { Preferencias, PreferenciasAtualizaveis } from '@/domain/types/entities';

type PreferenciasState = {
  preferencias: Preferencias | null;
  carregando: boolean;
  carregar: () => Promise<void>;
  atualizar: (dados: PreferenciasAtualizaveis) => Promise<void>;
};

export const usePreferenciasStore = create<PreferenciasState>((set, get) => ({
  preferencias: null,
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const preferencias = await repo.buscarPreferencias();
    set({ preferencias, carregando: false });
  },

  atualizar: async (dados) => {
    await repo.atualizarPreferencias(dados);
    await get().carregar();
  },
}));
