import { create } from 'zustand';
import * as repo from '@/data/repositories/comprasParceladasRepository';
import type { CompraParcelada, NovaCompraParcelada } from '@/domain/types/entities';

type ComprasParceladasState = {
  compras: CompraParcelada[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovaCompraParcelada, 'id' | 'ativo'>, mesPrimeiraParcela?: string) => Promise<void>;
  editar: (id: number, dados: repo.DadosEdicaoCompra) => Promise<void>;
};

export const useComprasParceladasStore = create<ComprasParceladasState>((set, get) => ({
  compras: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const compras = await repo.listarComprasParceladas();
    set({ compras, carregando: false });
  },

  criar: async (dados, mesPrimeiraParcela) => {
    await repo.criarCompraParcelada(dados, mesPrimeiraParcela);
    await get().carregar();
  },

  editar: async (id, dados) => {
    await repo.editarCompraParcelada(id, dados);
    await get().carregar();
  },
}));
