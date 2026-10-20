import { describe, expect, it } from '@jest/globals';
import { calcularGastosPorCategoria } from '@/domain/usecases/calcularGastosPorCategoria';
import { umaCategoria, umaMovimentacao, umGasto } from '@/test/fabricas';

const mercado = umaCategoria({ id: 1, nome: 'Mercado', cor: '#111111' });
const lazer = umaCategoria({ id: 2, nome: 'Lazer', cor: '#222222' });

describe('calcularGastosPorCategoria', () => {
  const movimentacoes = [
    umaMovimentacao({ tipo: 'saida', valor: 10000, data: '2026-04-02', categoriaId: 1 }),
    umaMovimentacao({ tipo: 'saida', valor: 5000, data: '2026-04-03', categoriaId: 2 }),
    umaMovimentacao({ tipo: 'entrada', valor: 99900, data: '2026-04-03', categoriaId: 1 }),
    umaMovimentacao({ tipo: 'transferencia', valor: 99900, data: '2026-04-03', categoriaId: 1 }),
    umaMovimentacao({ tipo: 'saida', valor: 99900, data: '2026-03-31', categoriaId: 1 }),
  ];
  const gastos = [
    umGasto({ valor: 3000, data: '2026-04-05', categoriaId: 1 }),
    umGasto({ valor: 2000, data: '2026-04-06', categoriaId: null }),
    umGasto({ valor: 99900, data: '2026-05-01', categoriaId: 2 }),
  ];

  it('soma saídas e gastos do mês por categoria, do maior para o menor', () => {
    expect(calcularGastosPorCategoria(movimentacoes, gastos, [mercado, lazer], '2026-04')).toEqual([
      { categoriaId: 1, nome: 'Mercado', cor: '#111111', total: 13000 },
      { categoriaId: 2, nome: 'Lazer', cor: '#222222', total: 5000 },
      { categoriaId: null, nome: 'Sem categoria', cor: '#6B6F68', total: 2000 },
    ]);
  });

  it('mês sem gastos devolve lista vazia', () => {
    expect(calcularGastosPorCategoria(movimentacoes, gastos, [mercado, lazer], '2026-06')).toEqual([]);
  });
});
