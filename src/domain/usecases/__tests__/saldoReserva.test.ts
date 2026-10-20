import { describe, expect, it } from '@jest/globals';
import { ajusteDoSaldoReserva, calcularValorReserva, comSaldo } from '@/domain/usecases/saldoReserva';
import { montarBackup, validarBackup } from '@/domain/usecases/backup';

const historico = [
  { tipo: 'aporte' as const, valor: 50000 },
  { tipo: 'aporte' as const, valor: 30000 },
  { tipo: 'retirada' as const, valor: 20000 },
];

describe('valor da reserva calculado pelo histórico', () => {
  it('aportes − retiradas', () => {
    expect(calcularValorReserva(historico)).toBe(60000);
    expect(calcularValorReserva([])).toBe(0);
  });

  it('a reserva vem com o valor guardado calculado', () => {
    const reserva = {
      id: 1,
      valorMeta: 1200000,
      mesesCoberturaDesejados: 6,
      indexador: 'cdi' as const,
      percentualIndexador: 10000,
      cobraIr: false,
    };
    expect(comSaldo(reserva, historico)).toEqual({ ...reserva, valorAtual: 60000 });
    expect(comSaldo(null, historico)).toBeNull();
  });
});

describe('ajuste para o histórico bater com o valor de antes', () => {
  it('histórico menor que o valor gravado: aporte de ajuste', () => {
    expect(ajusteDoSaldoReserva(75000, historico)).toEqual({ tipo: 'aporte', valor: 15000 });
  });

  it('histórico maior (retirada que tinha sido cortada em zero): retirada de ajuste', () => {
    expect(ajusteDoSaldoReserva(0, historico)).toEqual({ tipo: 'retirada', valor: 60000 });
  });

  it('já bate: sem ajuste', () => {
    expect(ajusteDoSaldoReserva(60000, historico)).toBeNull();
  });

  it('backup de antes da versão 8 ganha o mesmo ajuste ao restaurar', () => {
    const antigo = montarBackup(
      {
        categorias: [],
        reserva_emergencia: [{ id: 1, valor_meta: 1200000, valor_atual: 75000, meses_cobertura_desejados: 6 }],
        movimentacoes_reserva: [
          { id: 1, tipo: 'aporte', valor: 50000, data: '2026-01-10', justificativa: null },
          { id: 2, tipo: 'aporte', valor: 30000, data: '2026-02-10', justificativa: null },
          { id: 3, tipo: 'retirada', valor: 20000, data: '2026-03-10', justificativa: 'Carro' },
        ],
      },
      7,
      new Date(Date.UTC(2026, 9, 18, 12))
    );
    const resultado = validarBackup(JSON.parse(JSON.stringify(antigo)), 8);
    if (!resultado.ok) throw new Error(resultado.erro);

    expect(resultado.backup.tabelas.movimentacoes_reserva?.[3]).toEqual({
      id: 4,
      tipo: 'aporte',
      valor: 15000,
      data: '2026-10-18',
      justificativa: 'Ajuste para manter o saldo da reserva (Cofre 2.0)',
    });
  });
});
