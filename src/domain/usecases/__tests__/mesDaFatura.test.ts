import { describe, expect, it } from '@jest/globals';
import {
  dataFechamentoDaFatura,
  dataNoMes,
  mesDeCobrancaDaParcela,
  mesDeCobrancaDoGasto,
  mesFechamentoDaCompra,
  mesPrimeiraFatura,
  mesVencimentoDaFatura,
  situacaoVencimento,
} from '@/domain/usecases/mesDaFatura';
import { umaCompra, umaContaFixa, umaParcela, umCartao, umGasto } from '@/test/fabricas';

/** Fecha dia 25 e vence dia 5 do mês seguinte (o caso mais comum). */
const fecha25vence5 = umCartao({ id: 1, diaFechamento: 25, diaVencimento: 5 });
/** Fecha dia 3 e vence dia 10 do mesmo mês. */
const fecha3vence10 = umCartao({ id: 2, diaFechamento: 3, diaVencimento: 10 });
const cartoesPorId = new Map([
  [1, fecha25vence5],
  [2, fecha3vence10],
]);

describe('dataNoMes', () => {
  it('limita ao último dia do mês', () => {
    expect(dataNoMes('2026-06', 31)).toBe('2026-06-30');
    expect(dataNoMes('2026-02', 30)).toBe('2026-02-28');
    expect(dataNoMes('2028-02', 30)).toBe('2028-02-29');
  });

  it('completa o dia com zero', () => {
    expect(dataNoMes('2026-03', 5)).toBe('2026-03-05');
  });
});

describe('mesFechamentoDaCompra', () => {
  it('passou do fechamento, vai para a fatura seguinte', () => {
    expect(mesFechamentoDaCompra('2026-03-10', 5)).toBe('2026-04');
    expect(mesFechamentoDaCompra('2026-12-20', 10)).toBe('2027-01');
  });

  it('no dia do fechamento ainda entra na fatura do mês', () => {
    expect(mesFechamentoDaCompra('2026-03-05', 5)).toBe('2026-03');
  });
});

describe('mesVencimentoDaFatura e dataFechamentoDaFatura', () => {
  it('vencimento antes do fechamento cai no mês seguinte', () => {
    expect(mesVencimentoDaFatura('2026-03', fecha25vence5)).toBe('2026-04');
    expect(dataFechamentoDaFatura('2026-04', fecha25vence5)).toBe('2026-03-25');
  });

  it('vencimento depois do fechamento fica no mesmo mês', () => {
    expect(mesVencimentoDaFatura('2026-03', fecha3vence10)).toBe('2026-03');
    expect(dataFechamentoDaFatura('2026-04', fecha3vence10)).toBe('2026-04-03');
  });
});

describe('mesDeCobrancaDoGasto', () => {
  it('compra no cartão é paga no vencimento da fatura em que caiu', () => {
    const gasto = umGasto({ formaPagamento: 'cartao', cartaoId: 1, data: '2026-03-28' });
    expect(mesDeCobrancaDoGasto(gasto, cartoesPorId)).toBe('2026-05');
  });

  it('débito, pix e dinheiro saem no próprio mês', () => {
    expect(mesDeCobrancaDoGasto(umGasto({ formaPagamento: 'debito', data: '2026-03-28' }), cartoesPorId)).toBe('2026-03');
  });

  it('cartão desconhecido usa o mês do gasto', () => {
    const gasto = umGasto({ formaPagamento: 'cartao', cartaoId: 99, data: '2026-03-28' });
    expect(mesDeCobrancaDoGasto(gasto, cartoesPorId)).toBe('2026-03');
  });
});

describe('mesDeCobrancaDaParcela', () => {
  const compra = umaCompra({ id: 10, cartaoId: 1 });
  const fixaNoCartao = umaContaFixa({ id: 20, formaPagamento: 'cartao', cartaoId: 1, diaVencimento: 28 });
  const fixaNoDebito = umaContaFixa({ id: 21, formaPagamento: 'debito', diaVencimento: 28 });
  const contasPorId = new Map([
    [20, fixaNoCartao],
    [21, fixaNoDebito],
  ]);
  const comprasPorId = new Map([[10, compra]]);

  it('parcela de compra: mesReferencia é o fechamento, cobra no vencimento', () => {
    const parcela = umaParcela({ compraParceladaId: 10, mesReferencia: '2026-03' });
    expect(mesDeCobrancaDaParcela(parcela, contasPorId, comprasPorId, cartoesPorId)).toBe('2026-04');
  });

  it('conta fixa no cartão entra na fatura pela data de cobrança', () => {
    const parcela = umaParcela({ contaFixaId: 20, mesReferencia: '2026-03' });
    expect(mesDeCobrancaDaParcela(parcela, contasPorId, comprasPorId, cartoesPorId)).toBe('2026-05');
  });

  it('conta fixa fora do cartão vence no próprio mês', () => {
    const parcela = umaParcela({ contaFixaId: 21, mesReferencia: '2026-03' });
    expect(mesDeCobrancaDaParcela(parcela, contasPorId, comprasPorId, cartoesPorId)).toBe('2026-03');
  });
});

describe('situacaoVencimento', () => {
  it('descreve o prazo', () => {
    expect(situacaoVencimento('2026-03-10', false, '2026-03-05')).toEqual({ texto: 'Vence em 5 dias', atrasado: false });
    expect(situacaoVencimento('2026-03-10', false, '2026-03-09')).toEqual({ texto: 'Vence amanhã', atrasado: false });
    expect(situacaoVencimento('2026-03-10', false, '2026-03-10')).toEqual({ texto: 'Vence hoje', atrasado: false });
  });

  it('marca atraso só quando ainda não foi pago', () => {
    expect(situacaoVencimento('2026-03-10', false, '2026-03-11')).toEqual({ texto: 'Atrasado há 1 dia', atrasado: true });
    expect(situacaoVencimento('2026-03-10', false, '2026-03-12')).toEqual({ texto: 'Atrasado há 2 dias', atrasado: true });
    expect(situacaoVencimento('2026-03-10', true, '2026-03-12')).toEqual({ texto: 'Pago', atrasado: false });
  });
});

describe('mesPrimeiraFatura', () => {
  it('parte do fechamento da compra e aplica o deslocamento', () => {
    expect(mesPrimeiraFatura('2026-03-10', { diaFechamento: 5 }, 0)).toBe('2026-04');
    expect(mesPrimeiraFatura('2026-03-10', { diaFechamento: 5 }, -1)).toBe('2026-03');
    expect(mesPrimeiraFatura('2026-03-10', { diaFechamento: 5 }, 2)).toBe('2026-06');
  });

  it('sem data de compra não há mês', () => {
    expect(mesPrimeiraFatura(null, { diaFechamento: 5 }, 0)).toBeNull();
  });
});
