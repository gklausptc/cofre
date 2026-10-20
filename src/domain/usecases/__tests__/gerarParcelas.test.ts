import { describe, expect, it } from '@jest/globals';
import { gerarParcelas } from '@/domain/usecases/gerarParcelas';

const soma = (valores: number[]) => valores.reduce((total, v) => total + v, 0);

describe('gerarParcelas', () => {
  it('divide o total e joga a diferença de centavos na última parcela', () => {
    const parcelas = gerarParcelas({ id: 7, valorTotal: 10000, numParcelas: 3, dataCompra: '2026-01-10' }, { diaFechamento: 5 });

    expect(parcelas.map((p) => p.valor)).toEqual([3333, 3333, 3334]);
    expect(soma(parcelas.map((p) => p.valor))).toBe(10000);
  });

  it('numera de 1 a N, liga à compra e começa pendente', () => {
    const parcelas = gerarParcelas({ id: 7, valorTotal: 9000, numParcelas: 3, dataCompra: '2026-01-10' }, { diaFechamento: 5 });

    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(parcelas.every((p) => p.compraParceladaId === 7 && p.contaFixaId === null)).toBe(true);
    expect(parcelas.every((p) => p.status === 'pendente' && p.dataPagamento === null && p.faturaId === null)).toBe(true);
  });

  it('compra depois do fechamento cai na fatura do mês seguinte', () => {
    const parcelas = gerarParcelas({ id: 1, valorTotal: 30000, numParcelas: 3, dataCompra: '2026-01-10' }, { diaFechamento: 5 });
    expect(parcelas.map((p) => p.mesReferencia)).toEqual(['2026-02', '2026-03', '2026-04']);
  });

  it('compra no próprio dia do fechamento ainda entra na fatura do mês', () => {
    const parcelas = gerarParcelas({ id: 1, valorTotal: 20000, numParcelas: 2, dataCompra: '2026-01-05' }, { diaFechamento: 5 });
    expect(parcelas.map((p) => p.mesReferencia)).toEqual(['2026-01', '2026-02']);
  });

  it('vira o ano quando a compra é depois do fechamento de dezembro', () => {
    const parcelas = gerarParcelas({ id: 1, valorTotal: 20000, numParcelas: 2, dataCompra: '2026-12-20' }, { diaFechamento: 10 });
    expect(parcelas.map((p) => p.mesReferencia)).toEqual(['2027-01', '2027-02']);
  });

  it('respeita o mês da primeira fatura escolhido na tela', () => {
    const parcelas = gerarParcelas(
      { id: 1, valorTotal: 20000, numParcelas: 2, dataCompra: '2026-01-10' },
      { diaFechamento: 5 },
      '2026-06'
    );
    expect(parcelas.map((p) => p.mesReferencia)).toEqual(['2026-06', '2026-07']);
  });

  it('a soma das parcelas bate com o total mesmo em divisões quebradas', () => {
    const parcelas = gerarParcelas({ id: 1, valorTotal: 100001, numParcelas: 7, dataCompra: '2026-01-01' }, { diaFechamento: 5 });
    expect(soma(parcelas.map((p) => p.valor))).toBe(100001);
  });

  it('parcela única fica com o valor inteiro', () => {
    const [unica] = gerarParcelas({ id: 1, valorTotal: 4990, numParcelas: 1, dataCompra: '2026-01-01' }, { diaFechamento: 5 });
    expect(unica.valor).toBe(4990);
  });
});
