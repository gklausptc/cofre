import { describe, expect, it } from '@jest/globals';
import { calcularGastosFixosDoMes } from '@/domain/usecases/calcularGastosFixosDoMes';
import { gastosDoMes, luz, MES, nubank, parcelasDoMes, streaming, tv } from '@/test/cenarioMes';

describe('calcularGastosFixosDoMes', () => {
  const resumo = calcularGastosFixosDoMes([luz, streaming], parcelasDoMes, MES, [tv], [nubank], gastosDoMes);

  it('lista contas fixas, parcelas e compras no cartão que vencem no mês', () => {
    expect(resumo.itens.map((i) => [i.nome, i.valor, i.paga])).toEqual([
      ['Compras no Nubank', 100, false],
      ['Luz', 100, true],
      ['Streaming', 50, false],
      ['TV (3/10) · Nubank', 300, false],
    ]);
  });

  it('separa o que já foi pago do que falta', () => {
    expect(resumo.total).toBe(550);
    expect(resumo.totalPago).toBe(100);
    expect(resumo.totalPendente).toBe(450);
  });
});
