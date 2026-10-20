import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import { planejarPagamentoFatura, type PedidoPagamentoFatura } from '@/domain/usecases/pagarFatura';
import { hojeIso } from '@/core/utils/date';
import type { Fatura } from '@/domain/types/entities';

const repo = () => repositorios().faturas;

type FaturasState = {
  faturas: Fatura[];
  carregar: () => Promise<void>;
  /** Marca as parcelas da fatura como pagas e registra a fatura (e a conta de onde saiu o dinheiro). */
  pagarFatura: (pedido: PedidoPagamentoFatura) => Promise<void>;
};

export const useFaturasStore = create<FaturasState>((set, get) => ({
  faturas: [],

  carregar: async () => {
    set({ faturas: await repo().listarFaturas() });
  },

  pagarFatura: async (pedido) => {
    const plano = planejarPagamentoFatura(pedido, hojeIso());
    const repos = repositorios();
    // baixa nas parcelas, registro da fatura e saída na conta juntos: ou grava tudo, ou nada
    await repos.manutencao.emTransacao(async () => {
      await repos.parcelas.marcarParcelasPagas(plano.parcelasAPagar, plano.dataPagamento);
      const faturaId = await repo().registrarPagamentoFatura(plano.registro);
      await repos.movimentacoes.registrarPagamentoVinculado({ faturaId }, plano.saida);
    });
    await get().carregar();
  },
}));
