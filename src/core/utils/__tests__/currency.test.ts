import { describe, expect, it } from '@jest/globals';
import {
  dividirEmParcelas,
  formatarDecimal,
  formatarMoeda,
  reaisParaCentavos,
  textoParaCentavos,
} from '@/core/utils/currency';

const NBSP = String.fromCharCode(0xa0);

describe('formatarMoeda', () => {
  it('recebe centavos e mostra em reais no padrão brasileiro', () => {
    expect(formatarMoeda(123456).replace(NBSP, ' ')).toBe('R$ 1.234,56');
    expect(formatarMoeda(5).replace(NBSP, ' ')).toBe('R$ 0,05');
    expect(formatarMoeda(0).replace(NBSP, ' ')).toBe('R$ 0,00');
  });
});

describe('formatarDecimal', () => {
  it('centavos como texto com vírgula, sem milhar', () => {
    expect(formatarDecimal(123456)).toBe('1234,56');
    expect(formatarDecimal(-1010)).toBe('-10,10');
    expect(formatarDecimal(5)).toBe('0,05');
    expect(formatarDecimal(0)).toBe('0,00');
  });
});

describe('reaisParaCentavos', () => {
  it('arredonda para o centavo mais próximo', () => {
    expect(reaisParaCentavos(10.07)).toBe(1007);
    expect(reaisParaCentavos(0.1 + 0.2)).toBe(30);
    expect(reaisParaCentavos(1234.56)).toBe(123456);
  });
});

describe('dividirEmParcelas', () => {
  it('parcelas iguais e o resto na última', () => {
    expect(dividirEmParcelas(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(dividirEmParcelas(5, 3)).toEqual([1, 1, 3]);
    expect(dividirEmParcelas(9000, 3)).toEqual([3000, 3000, 3000]);
  });

  it('a soma é sempre exatamente o total', () => {
    for (const [total, n] of [
      [100001, 7],
      [99999, 12],
      [1, 4],
    ]) {
      expect(dividirEmParcelas(total, n).reduce((soma, v) => soma + v, 0)).toBe(total);
    }
  });

  it('sem parcelas, lista vazia', () => {
    expect(dividirEmParcelas(1000, 0)).toEqual([]);
  });
});

describe('textoParaCentavos', () => {
  it('formatos brasileiro e americano', () => {
    expect(textoParaCentavos('1.234,56')).toBe(123456);
    expect(textoParaCentavos('1,234.56')).toBe(123456);
    expect(textoParaCentavos('1.234.567,89')).toBe(123456789);
    expect(textoParaCentavos('1234.56')).toBe(123456);
  });

  it('uma casa decimal, sem decimais e só milhar', () => {
    expect(textoParaCentavos('10,5')).toBe(1050);
    expect(textoParaCentavos('1500.5')).toBe(150050);
    expect(textoParaCentavos('42')).toBe(4200);
    expect(textoParaCentavos('1.234')).toBe(123400);
    expect(textoParaCentavos('0,07')).toBe(7);
  });

  it('sinal e símbolo da moeda', () => {
    expect(textoParaCentavos('-50,00')).toBe(-5000);
    expect(textoParaCentavos('R$ 10,50')).toBe(1050);
    expect(textoParaCentavos('-R$ 5')).toBe(-500);
  });

  it('texto sem número vira NaN', () => {
    expect(textoParaCentavos('')).toBeNaN();
    expect(textoParaCentavos('abc')).toBeNaN();
    expect(textoParaCentavos('R$')).toBeNaN();
  });
});
