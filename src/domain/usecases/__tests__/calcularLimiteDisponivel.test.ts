import { describe, expect, it } from '@jest/globals';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';
import { umaCompra, umaParcela, umCartao, umGasto } from '@/test/fabricas';

const cartao = umCartao({ id: 1, limite: 5000 });
const compras = [umaCompra({ id: 1, cartaoId: 1 }), umaCompra({ id: 2, cartaoId: 2 })];

describe('calcularLimiteDisponivel', () => {
  it('sem uso, o limite inteiro está disponível', () => {
    expect(calcularLimiteDisponivel(cartao, compras, [], [])).toBe(5000);
  });

  it('desconta parcelas pendentes das compras deste cartão', () => {
    const parcelas = [
      umaParcela({ compraParceladaId: 1, valor: 100 }),
      umaParcela({ compraParceladaId: 1, valor: 100 }),
      umaParcela({ compraParceladaId: 1, valor: 100, status: 'paga' }),
      umaParcela({ compraParceladaId: 2, valor: 500 }),
      umaParcela({ contaFixaId: 9, valor: 80 }),
    ];
    expect(calcularLimiteDisponivel(cartao, compras, parcelas, [])).toBe(4800);
  });

  it('desconta compras à vista feitas neste cartão', () => {
    const gastos = [
      umGasto({ formaPagamento: 'cartao', cartaoId: 1, valor: 300 }),
      umGasto({ formaPagamento: 'cartao', cartaoId: 2, valor: 50 }),
      umGasto({ formaPagamento: 'debito', cartaoId: 1, valor: 70 }),
    ];
    expect(calcularLimiteDisponivel(cartao, compras, [], gastos)).toBe(4700);
  });
});
