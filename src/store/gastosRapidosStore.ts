import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { GastoRapido, NovoGastoRapido } from '@/domain/types/entities';
import { pedirReagendamento } from '@/core/notifications/agendador';

const repo = () => repositorios().gastosRapidos;

type GastosRapidosState = {
  gastos: GastoRapido[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovoGastoRapido, 'id'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<Omit<NovoGastoRapido, 'id'>>) => Promise<void>;
  /** Remove e devolve o gasto (para o "Desfazer"); a foto do comprovante fica até `esquecer`. */
  remover: (id: number) => Promise<GastoRapido | null>;
  /** "Desfazer": grava de novo o gasto removido. */
  restaurar: (gasto: GastoRapido) => Promise<void>;
  ajustarValor: (id: number, novoValor: number, justificativa: string) => Promise<void>;
};

export const useGastosRapidosStore = create<GastosRapidosState>((set, get) => ({
  gastos: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const gastos = await repo().listarGastosRapidos();
    set({ gastos, carregando: false });
  },

  criar: async (dados) => {
    await repo().criarGastoRapido(dados);
    await get().carregar();
    pedirReagendamento();
  },

  atualizar: async (id, dados) => {
    await repo().atualizarGastoRapido(id, dados);
    await get().carregar();
    pedirReagendamento();
  },

  remover: async (id) => {
    const gasto = await repo().buscarGastoRapido(id);
    await repo().excluirGastoRapido(id);
    await get().carregar();
    pedirReagendamento();
    return gasto;
  },

  restaurar: async (gasto) => {
    const { id: _id, ...dados } = gasto;
    void _id;
    await repo().criarGastoRapido(dados);
    await get().carregar();
    pedirReagendamento();
  },

  ajustarValor: async (id, novoValor, justificativa) => {
    await repo().ajustarValorGasto(id, novoValor, justificativa);
    await get().carregar();
    pedirReagendamento();
  },
}));
