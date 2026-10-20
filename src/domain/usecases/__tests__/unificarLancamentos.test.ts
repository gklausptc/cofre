import { describe, expect, it } from '@jest/globals';
import { unificarLancamentos } from '@/domain/usecases/unificarLancamentos';
import { umaMovimentacao, umGasto } from '@/test/fabricas';

describe('unificarLancamentos', () => {
  const lista = unificarLancamentos(
    [
      umaMovimentacao({ id: 1, tipo: 'entrada', valor: 10000, data: '2026-03-01' }),
      umaMovimentacao({ id: 2, tipo: 'saida', valor: 2000, data: '2026-03-03', descricao: 'Farmácia', membroId: 4 }),
      umaMovimentacao({ id: 3, tipo: 'transferencia', valor: 5000, data: '2026-03-02', reservarProximoMes: true }),
    ],
    [umGasto({ id: 1, valor: 1000, data: '2026-03-04' })]
  );

  it('junta movimentações e gastos, do mais recente para o mais antigo', () => {
    expect(lista.map((l) => l.id)).toEqual(['gasto-1', 'mov-2', 'mov-3', 'mov-1']);
  });

  it('dá descrição padrão a quem não tem', () => {
    expect(lista.map((l) => l.descricao)).toEqual(['Gasto rápido', 'Farmácia', 'Transferência', 'Entrada']);
  });

  it('marca saídas (inclusive transferência e gasto) e preserva origem e membro', () => {
    expect(lista.map((l) => l.saida)).toEqual([true, true, true, false]);
    expect(lista[1]).toMatchObject({ origemId: 2, tipoOrigem: 'movimentacao', membroId: 4 });
    expect(lista[0]).toMatchObject({ origemId: 1, tipoOrigem: 'gasto' });
    expect(lista[2].reservarProximoMes).toBe(true);
  });
});
