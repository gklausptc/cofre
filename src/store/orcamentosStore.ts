import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { DadosOrcamento } from '@/domain/repositories/orcamentosRepository';
import type { Orcamento } from '@/domain/types/entities';

const repo = () => repositorios().orcamentos;

type OrcamentosState = {
  orcamentos: Orcamento[];
  carregar: () => Promise<void>;
  definir: (dados: DadosOrcamento) => Promise<void>;
  /** Vários de uma vez ("Usar todas as sugestões"). */
  definirVarios: (dados: DadosOrcamento[]) => Promise<void>;
  remover: (categoriaId: number, mes: string) => Promise<void>;
};

export const useOrcamentosStore = create<OrcamentosState>((set, get) => ({
  orcamentos: [],

  carregar: async () => {
    set({ orcamentos: await repo().listarOrcamentos() });
  },

  definir: async (dados) => {
    await repo().definirOrcamento(dados);
    await get().carregar();
  },

  definirVarios: async (lista) => {
    for (const dados of lista) await repo().definirOrcamento(dados);
    await get().carregar();
  },

  remover: async (categoriaId, mes) => {
    await repo().removerOrcamento(categoriaId, mes);
    await get().carregar();
  },
}));
