import { ehDespesa } from '@/domain/usecases/naturezaMovimentacao';
import type { Categoria, GastoRapido, Movimentacao } from '@/domain/types/entities';

export type GastoPorCategoria = {
  categoriaId: number | null;
  nome: string;
  cor: string;
  total: number;
};

export function calcularGastosPorCategoria(
  movimentacoes: Movimentacao[],
  gastos: GastoRapido[],
  categorias: Categoria[],
  mesReferencia: string
): GastoPorCategoria[] {
  const totais = new Map<number | null, number>();

  for (const mov of movimentacoes) {
    // pagamento de fatura/conta fixa não é gasto de categoria (as compras já contam)
    if (!ehDespesa(mov) || !mov.data.startsWith(mesReferencia)) continue;
    totais.set(mov.categoriaId, (totais.get(mov.categoriaId) ?? 0) + mov.valor);
  }

  for (const gasto of gastos) {
    if (!gasto.data.startsWith(mesReferencia)) continue;
    totais.set(gasto.categoriaId, (totais.get(gasto.categoriaId) ?? 0) + gasto.valor);
  }

  const resultado: GastoPorCategoria[] = Array.from(totais.entries()).map(([categoriaId, total]) => {
    const categoria = categorias.find((c) => c.id === categoriaId);
    return {
      categoriaId,
      nome: categoria?.nome ?? 'Sem categoria',
      cor: categoria?.cor ?? '#6B6F68',
      total,
    };
  });

  return resultado.sort((a, b) => b.total - a.total);
}
