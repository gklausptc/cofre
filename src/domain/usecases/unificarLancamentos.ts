import type { GastoRapido, Movimentacao } from '@/domain/types/entities';

export type LancamentoUnificado = {
  id: string;
  origemId: number;
  tipoOrigem: 'movimentacao' | 'gasto';
  data: string;
  descricao: string;
  valor: number;
  saida: boolean;
  membroId: number | null;
  reservarProximoMes: boolean;
};

export function unificarLancamentos(
  movimentacoes: Movimentacao[],
  gastos: GastoRapido[]
): LancamentoUnificado[] {
  const doMovimentacoes: LancamentoUnificado[] = movimentacoes.map((mov) => ({
    id: `mov-${mov.id}`,
    origemId: mov.id,
    tipoOrigem: 'movimentacao',
    data: mov.data,
    descricao:
      mov.descricao || (mov.tipo === 'entrada' ? 'Entrada' : mov.tipo === 'saida' ? 'Saída' : 'Transferência'),
    valor: mov.valor,
    saida: mov.tipo !== 'entrada',
    membroId: mov.membroId,
    reservarProximoMes: Boolean(mov.reservarProximoMes),
  }));

  const doGastos: LancamentoUnificado[] = gastos.map((gasto) => ({
    id: `gasto-${gasto.id}`,
    origemId: gasto.id,
    tipoOrigem: 'gasto',
    data: gasto.data,
    descricao: gasto.descricao || 'Gasto rápido',
    valor: gasto.valor,
    saida: true,
    membroId: gasto.membroId,
    reservarProximoMes: false,
  }));

  return [...doMovimentacoes, ...doGastos].sort((a, b) => b.data.localeCompare(a.data));
}
