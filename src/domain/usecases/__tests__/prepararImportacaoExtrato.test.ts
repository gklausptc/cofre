import { describe, expect, it } from '@jest/globals';
import { ehPagamentoOuEstorno, prepararImportacaoExtrato } from '@/domain/usecases/prepararImportacaoExtrato';

const transacoes = [
  { data: '2026-03-05', descricao: 'Mercado', valor: -5000 },
  { data: '2026-03-06', descricao: 'Salário', valor: 100000 },
];

describe('prepararImportacaoExtrato', () => {
  it('conta bancária: negativo vira saída, positivo vira entrada', () => {
    const preparada = prepararImportacaoExtrato(transacoes, { tipo: 'conta', contaBancariaId: 4 });

    expect(preparada.movimentacoes.map((m) => [m.tipo, m.valor, m.data, m.descricao])).toEqual([
      ['saida', 5000, '2026-03-05', 'Mercado'],
      ['entrada', 100000, '2026-03-06', 'Salário'],
    ]);
    expect(preparada.movimentacoes.every((m) => m.contaBancariaId === 4 && m.categoriaId === null)).toBe(true);
    expect(preparada.gastos).toEqual([]);
    expect(preparada.ignoradas).toBe(0);
  });

  it('cartão: compras viram gastos no cartão; pagamentos e estornos ficam de fora', () => {
    const preparada = prepararImportacaoExtrato(
      [
        { data: '2026-03-05', descricao: 'Loja', valor: 12000 },
        { data: '2026-03-10', descricao: 'Pagamento recebido', valor: -50000 },
      ],
      { tipo: 'cartao', cartaoId: 2 }
    );

    expect(preparada.gastos.map((g) => [g.valor, g.formaPagamento, g.cartaoId, g.descricao])).toEqual([
      [12000, 'cartao', 2, 'Loja'],
    ]);
    expect(preparada.movimentacoes).toEqual([]);
    expect(preparada.ignoradas).toBe(1);
  });
});

describe('ehPagamentoOuEstorno', () => {
  it('só valor negativo em fatura de cartão', () => {
    expect(ehPagamentoOuEstorno({ valor: -1000 }, { tipo: 'cartao', cartaoId: 1 })).toBe(true);
    expect(ehPagamentoOuEstorno({ valor: 1000 }, { tipo: 'cartao', cartaoId: 1 })).toBe(false);
    expect(ehPagamentoOuEstorno({ valor: -1000 }, { tipo: 'conta', contaBancariaId: 1 })).toBe(false);
  });
});
