import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { Parcela } from '@/domain/types/entities';
import { hojeIso } from '@/core/utils/date';
import { planejarPagamentoContaFixa } from '@/domain/usecases/pagarFatura';
import { pedirReagendamento } from '@/core/notifications/agendador';

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
    const repos = repositorios();
    const parcela = await repo().buscarParcela(id);
    if (!parcela) return;
    const contaFixa = parcela.contaFixaId !== null ? await repos.contasFixas.buscarContaFixa(parcela.contaFixaId) : null;
    const plano = planejarPagamentoContaFixa(parcela, contaFixa, hojeIso());
    // baixa na ocorrência e saída na conta juntas: ou grava as duas, ou nenhuma
    await repos.manutencao.emTransacao(async () => {
      await repo().marcarParcelaPaga(plano.parcelaId, plano.dataPagamento);
      await repos.movimentacoes.registrarPagamentoVinculado({ parcelaId: plano.parcelaId }, plano.saida);
    });
    await get().carregar();
    pedirReagendamento();
  },

  ajustarValor: async (id, novoValor, justificativa) => {
    await repo().ajustarValorParcela(id, novoValor, justificativa);
    await get().carregar();
    pedirReagendamento();
  },
}));
