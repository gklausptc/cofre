import { create } from 'zustand';
import * as repo from '@/data/repositories/faturasRepository';
import { marcarParcelasPagas } from '@/data/repositories/parcelasRepository';
import { dataFechamentoDaFatura, dataNoMes } from '@/domain/usecases/mesDaFatura';
import { hojeIso } from '@/core/utils/date';
import type { Cartao, Fatura } from '@/domain/types/entities';

type PagarFaturaParams = {
  cartao: Pick<Cartao, 'id' | 'diaFechamento' | 'diaVencimento'>;
  mesReferencia: string;
  valorPago: number;
  parcelaIds: number[];
  contaBancariaId: number | null;
};

type FaturasState = {
  faturas: Fatura[];
  carregar: () => Promise<void>;
  /** Marca as parcelas da fatura como pagas e registra a fatura (e a conta de onde saiu o dinheiro). */
  pagarFatura: (params: PagarFaturaParams) => Promise<void>;
};

export const useFaturasStore = create<FaturasState>((set, get) => ({
  faturas: [],

  carregar: async () => {
    set({ faturas: await repo.listarFaturas() });
  },

  pagarFatura: async ({ cartao, mesReferencia, valorPago, parcelaIds, contaBancariaId }) => {
    const hoje = hojeIso();
    await marcarParcelasPagas(parcelaIds, hoje);
    await repo.registrarPagamentoFatura({
      cartaoId: cartao.id,
      mesReferencia,
      dataFechamento: dataFechamentoDaFatura(mesReferencia, cartao),
      dataVencimento: dataNoMes(mesReferencia, cartao.diaVencimento),
      contaBancariaId,
      valorPago,
      dataPagamento: hoje,
    });
    await get().carregar();
  },
}));
