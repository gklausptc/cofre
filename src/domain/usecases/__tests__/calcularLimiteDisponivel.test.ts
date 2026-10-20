import { describe, expect, it } from '@jest/globals';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';
import { umaCompra, umaParcela, umCartao, umGasto } from '@/test/fabricas';

const cartao = umCartao({ id: 1, limite: 500000 });
const compras = [umaCompra({ id: 1, cartaoId: 1 }), umaCompra({ id: 2, cartaoId: 2 })];

describe('calcularLimiteDisponivel', () => {
  it('sem uso, o limite inteiro está disponível', () => {
    expect(calcularLimiteDisponivel(cartao, compras, [], [])).toBe(500000);
  });

  it('desconta parcelas pendentes das compras deste cartão', () => {
    const parcelas = [
      umaParcela({ compraParceladaId: 1, valor: 10000 }),
      umaParcela({ compraParceladaId: 1, valor: 10000 }),
      umaParcela({ compraParceladaId: 1, valor: 10000, status: 'paga' }),
      umaParcela({ compraParceladaId: 2, valor: 50000 }),
      umaParcela({ contaFixaId: 9, valor: 8000 }),
    ];
    expect(calcularLimiteDisponivel(cartao, compras, parcelas, [])).toBe(480000);
  });

  it('desconta compras à vista feitas neste cartão', () => {
    const gastos = [
      umGasto({ formaPagamento: 'cartao', cartaoId: 1, valor: 30000 }),
      umGasto({ formaPagamento: 'cartao', cartaoId: 2, valor: 5000 }),
      umGasto({ formaPagamento: 'debito', cartaoId: 1, valor: 7000 }),
    ];
    expect(calcularLimiteDisponivel(cartao, compras, [], gastos)).toBe(470000);
  });
});
