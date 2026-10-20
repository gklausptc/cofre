import { useCallback, useMemo } from 'react';
import { useMovimentacoesStore } from './movimentacoesStore';
import { useGastosRapidosStore } from './gastosRapidosStore';
import { useParcelasStore } from './parcelasStore';
import { useContasFixasStore } from './contasFixasStore';
import { useComprasParceladasStore } from './comprasParceladasStore';
import { useCartoesStore } from './cartoesStore';
import { useFaturasStore } from './faturasStore';
import { useCofrinhosStore } from './cofrinhosStore';
import { useAportesCofrinhoStore } from './aportesCofrinhoStore';
import { useReservaEmergenciaStore } from './reservaEmergenciaStore';
import { useContasBancariasStore } from './contasBancariasStore';
import { useCategoriasStore } from './categoriasStore';
import type { DadosFinanceiros } from '@/domain/usecases/obterLancamentosDoPeriodo';

/**
 * Tudo o que vira lançamento (para `obterLancamentosDoPeriodo`), mais contas e categorias,
 * lido dos stores. `carregarTudo` recarrega todos de uma vez (use no useFocusEffect).
 */
export function useDadosFinanceiros() {
  const { movimentacoes, carregar: c1 } = useMovimentacoesStore();
  const { gastos, carregar: c2 } = useGastosRapidosStore();
  const { parcelas, carregar: c3 } = useParcelasStore();
  const { contas: contasFixas, carregar: c4 } = useContasFixasStore();
  const { compras: comprasParceladas, carregar: c5 } = useComprasParceladasStore();
  const { cartoes, carregar: c6 } = useCartoesStore();
  const { faturas, carregar: c7 } = useFaturasStore();
  const { cofrinhos, carregar: c8 } = useCofrinhosStore();
  const { aportes: aportesCofrinho, carregar: c9 } = useAportesCofrinhoStore();
  const { reserva, historico: movimentacoesReserva, carregar: c10 } = useReservaEmergenciaStore();
  const { contas, carregar: c11 } = useContasBancariasStore();
  const { categorias, carregar: c12 } = useCategoriasStore();

  const carregarTudo = useCallback(() => {
    void Promise.all([c1(), c2(), c3(), c4(), c5(), c6(), c7(), c8(), c9(), c10(), c11(), c12()]);
  }, [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12]);

  const dados = useMemo<DadosFinanceiros>(
    () => ({
      movimentacoes,
      gastos,
      parcelas,
      contasFixas,
      comprasParceladas,
      cartoes,
      faturas,
      cofrinhos,
      aportesCofrinho,
      movimentacoesReserva,
    }),
    [movimentacoes, gastos, parcelas, contasFixas, comprasParceladas, cartoes, faturas, cofrinhos, aportesCofrinho, movimentacoesReserva]
  );

  return { dados, contas, categorias, reserva, carregarTudo };
}
