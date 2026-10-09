import { create } from 'zustand';
import * as repo from '@/data/repositories/reservaEmergenciaRepository';
import * as historicoRepo from '@/data/repositories/movimentacoesReservaRepository';
import type { MovimentacaoReserva, ReservaEmergencia } from '@/domain/types/entities';

type ReservaEmergenciaState = {
  reserva: ReservaEmergencia | null;
  historico: MovimentacaoReserva[];
  carregando: boolean;
  carregar: () => Promise<void>;
  definirMeta: (valorMeta: number, mesesCoberturaDesejados: number | null) => Promise<void>;
  aportar: (valor: number) => Promise<void>;
  retirar: (valor: number, justificativa: string) => Promise<void>;
  removerReserva: () => Promise<void>;
};

export const useReservaEmergenciaStore = create<ReservaEmergenciaState>((set, get) => ({
  reserva: null,
  historico: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const [reserva, historico] = await Promise.all([
      repo.buscarReservaEmergencia(),
      historicoRepo.listarMovimentacoesReserva(),
    ]);
    set({ reserva, historico, carregando: false });
  },

  definirMeta: async (valorMeta, mesesCoberturaDesejados) => {
    await repo.definirMetaReserva(valorMeta, mesesCoberturaDesejados);
    await get().carregar();
  },

  aportar: async (valor) => {
    await repo.aportarReserva(valor);
    await get().carregar();
  },

  retirar: async (valor, justificativa) => {
    await repo.retirarReserva(valor, justificativa);
    await get().carregar();
  },

  removerReserva: async () => {
    await repo.removerReservaEmergencia();
    await get().carregar();
  },
}));
