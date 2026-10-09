import { create } from 'zustand';
import * as repo from '@/data/repositories/aportesCofrinhoRepository';
import { buscarCofrinho, marcarCofrinhoConcluido } from '@/data/repositories/cofrinhosRepository';
import { notificarImediatamente } from '@/core/notifications/notificationService';
import type { AporteCofrinho } from '@/domain/types/entities';
import { hojeIso } from '@/core/utils/date';

type AportesCofrinhoState = {
  aportes: AporteCofrinho[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (cofrinhoId: number, valor: number) => Promise<void>;
};

export const useAportesCofrinhoStore = create<AportesCofrinhoState>((set, get) => ({
  aportes: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const aportes = await repo.listarAportes();
    set({ aportes, carregando: false });
  },

  criar: async (cofrinhoId, valor) => {
    await repo.criarAporte(cofrinhoId, valor, hojeIso());
    await get().carregar();

    const cofrinho = await buscarCofrinho(cofrinhoId);
    if (!cofrinho || cofrinho.status === 'concluido') return;
    const totalAportado = get()
      .aportes.filter((a) => a.cofrinhoId === cofrinhoId)
      .reduce((soma, a) => soma + a.valor, 0);
    if (totalAportado >= cofrinho.valorMeta) {
      await marcarCofrinhoConcluido(cofrinhoId);
      await notificarImediatamente('Meta atingida! 🎉', `Você completou o cofrinho "${cofrinho.nome}".`);
    }
  },
}));
