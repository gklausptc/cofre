import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import { notificarImediatamente } from '@/core/notifications/notificationService';
import type { AporteCofrinho } from '@/domain/types/entities';
import { hojeIso } from '@/core/utils/date';
import { cofrinhoAtingiuMeta } from '@/domain/usecases/calcularProgressoCofrinho';

const repo = () => repositorios().aportesCofrinho;

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
    const aportes = await repo().listarAportes();
    set({ aportes, carregando: false });
  },

  criar: async (cofrinhoId, valor) => {
    await repo().criarAporte(cofrinhoId, valor, hojeIso());
    await get().carregar();

    const cofrinho = await repositorios().cofrinhos.buscarCofrinho(cofrinhoId);
    if (!cofrinho) return;
    if (cofrinhoAtingiuMeta(cofrinho, get().aportes.filter((a) => a.cofrinhoId === cofrinhoId))) {
      await repositorios().cofrinhos.marcarCofrinhoConcluido(cofrinhoId);
      await notificarImediatamente('Meta atingida! 🎉', `Você completou o cofrinho "${cofrinho.nome}".`);
    }
  },
}));
