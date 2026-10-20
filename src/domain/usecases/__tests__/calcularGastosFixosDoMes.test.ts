import { describe, expect, it } from '@jest/globals';
import { calcularGastosFixosDoMes } from '@/domain/usecases/calcularGastosFixosDoMes';
import { gastosDoMes, luz, MES, nubank, parcelasDoMes, streaming, tv } from '@/test/cenarioMes';

describe('calcularGastosFixosDoMes', () => {
  const resumo = calcularGastosFixosDoMes([luz, streaming], parcelasDoMes, MES, [tv], [nubank], gastosDoMes);

  it('lista contas fixas, parcelas e compras no cartão que vencem no mês', () => {
    expect(resumo.itens.map((i) => [i.nome, i.valor, i.paga])).toEqual([
      ['Compras no Nubank', 10000, false],
      ['Luz', 10000, true],
      ['Streaming', 5000, false],
      ['TV (3/10) · Nubank', 30000, false],
    ]);
  });

  it('separa o que já foi pago do que falta', () => {
    expect(resumo.total).toBe(55000);
    expect(resumo.totalPago).toBe(10000);
    expect(resumo.totalPendente).toBe(45000);
  });

  it('diz quanto é conta fixa, parcela e compra no cartão, e onde abrir cada item', () => {
    expect(resumo.porTipo).toEqual({ conta_fixa: 15000, parcela: 30000, cartao: 10000 });
    expect(resumo.itens.map((i) => [i.tipo, i.link])).toEqual([
      ['cartao', `/cartao/${nubank.id}`],
      ['conta_fixa', `/conta-fixa/${luz.id}`],
      ['conta_fixa', `/conta-fixa/${streaming.id}`],
      ['parcela', `/compra-parcelada/${tv.id}`],
    ]);
  });
});
