import { describe, expect, it } from '@jest/globals';
import { calcularPagamentosDoMes } from '@/domain/usecases/calcularPagamentosDoMes';
import { umaFatura } from '@/test/fabricas';
import { gastosDoMes, luz, MES, nubank, parcelasDoMes, streaming, tv } from '@/test/cenarioMes';

describe('calcularPagamentosDoMes', () => {
  const resultado = calcularPagamentosDoMes([luz, streaming], parcelasDoMes, [tv], [nubank], gastosDoMes, [], MES);

  it('um grupo de contas fixas e um grupo de fatura por cartão', () => {
    expect(resultado.grupos.map((g) => g.titulo)).toEqual(['Contas fixas', 'Fatura Nubank']);
  });

  it('contas fixas fora do cartão vencem no dia delas', () => {
    const [fixas] = resultado.grupos;
    expect(fixas.itens.map((i) => [i.nome, i.vencimento, i.paga])).toEqual([['Luz', '2026-04-10', true]]);
    expect(fixas.pendente).toBe(0);
  });

  it('a fatura reúne conta fixa no cartão, parcela e compras à vista que vencem no mês', () => {
    const fatura = resultado.grupos[1];
    expect(fatura.itens.map((i) => [i.nome, i.valor])).toEqual([
      ['iFood', 40],
      ['Mercado', 60],
      ['Streaming', 50],
      ['TV', 300],
    ]);
    expect(fatura.vencimento).toBe('2026-04-05');
    expect(fatura.total).toBe(450);
    expect(fatura.pendente).toBe(450);
  });

  it('totais do mês', () => {
    expect(resultado.total).toBe(550);
    expect(resultado.totalPago).toBe(100);
    expect(resultado.totalPendente).toBe(450);
  });

  it('fatura paga marca todos os itens do grupo como pagos', () => {
    const faturaPaga = umaFatura({ cartaoId: 1, mesReferencia: MES, status: 'paga' });
    const comFaturaPaga = calcularPagamentosDoMes([luz, streaming], parcelasDoMes, [tv], [nubank], gastosDoMes, [faturaPaga], MES);
    const fatura = comFaturaPaga.grupos[1];

    expect(fatura.faturaPaga).toBe(true);
    expect(fatura.itens.every((i) => i.paga)).toBe(true);
    expect(fatura.pendente).toBe(0);
    expect(comFaturaPaga.totalPendente).toBe(0);
  });

  it('mês sem nada a pagar não tem grupos', () => {
    expect(calcularPagamentosDoMes([luz], [], [], [nubank], [], [], MES).grupos).toEqual([]);
  });
});
