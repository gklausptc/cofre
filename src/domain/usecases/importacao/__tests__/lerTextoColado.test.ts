import { describe, expect, it } from '@jest/globals';
import { lerTextoColado } from '@/domain/usecases/importacao/lerTextoColado';

const hoje = '2026-10-20';

describe('lerTextoColado (print da fatura aberta)', () => {
  it('data numa linha, compras embaixo, valor na mesma linha ou na de baixo', () => {
    const print = ['Fatura aberta', 'Fecha em 24 OUT', 'R$ 1.234,56', '18 OUT', 'UBER *TRIP', 'R$ 23,90', 'IFOOD *RESTAURANTE 45,90', 'Hoje', 'PADARIA PAO QUENTE 12,00', 'Pagamento recebido 500,00'].join('\n');
    const extrato = lerTextoColado([print], 'cartao', hoje);
    expect(extrato?.transacoes.map((t) => [t.data, t.descricao, t.valor])).toEqual([
      ['2026-10-18', 'UBER *TRIP', 2390],
      ['2026-10-18', 'IFOOD *RESTAURANTE', 4590],
      ['2026-10-20', 'PADARIA PAO QUENTE', 1200],
      ['2026-10-20', 'Pagamento recebido', -50000],
    ]);
  });

  it('o que se repete entre dois prints entra uma vez; dentro do mesmo print, não junta', () => {
    const primeiro = ['12/10', 'CAFE 5,00', 'CAFE 5,00', 'LOJA X 30,00'].join('\n');
    const segundo = ['12/10', 'LOJA X 30,00', '13/10', 'MERCADO 80,00'].join('\n');
    const extrato = lerTextoColado([primeiro, segundo], 'cartao', hoje);
    expect(extrato?.transacoes.map((t) => [t.data, t.descricao, t.valor])).toEqual([
      ['2026-10-12', 'CAFE', 500],
      ['2026-10-12', 'CAFE', 500],
      ['2026-10-12', 'LOJA X', 3000],
      ['2026-10-13', 'MERCADO', 8000],
    ]);
  });

  it('conta: entrada e saída pelo sinal ou pelo texto; mês depois de hoje é do ano passado', () => {
    const print = ['Sexta, 12 de dezembro', 'Pix recebido Fulano + R$ 100,00', 'Compra no débito MERCADO - R$ 50,00'].join('\n');
    const extrato = lerTextoColado([print], 'conta', hoje);
    expect(extrato?.transacoes.map((t) => [t.data, t.valor])).toEqual([
      ['2025-12-12', 10000],
      ['2025-12-12', -5000],
    ]);
    expect(lerTextoColado(['nada aqui'], 'conta', hoje)).toBeNull();
  });
});
