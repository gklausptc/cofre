import { describe, expect, it } from '@jest/globals';
import { montarRelatorioAnual, relatorioAnualEmHtml } from '@/domain/usecases/automacoes/relatorioAnual';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

let proximo = 0;
function lancamento(dados: Partial<LancamentoDoPeriodo>): LancamentoDoPeriodo {
  const data = dados.data ?? '2026-01-10';
  return {
    id: `l-${++proximo}`,
    tipo: 'movimentacao',
    natureza: 'despesa',
    status: 'pago',
    valor: 1000,
    data,
    competencia: data.slice(0, 7),
    descricao: 'Lançamento',
    origem: 'manual',
    noCartao: false,
    contaBancariaId: 1,
    cartaoId: null,
    categoriaId: null,
    membroId: null,
    link: '/',
    ...dados,
  };
}

const categorias = [
  { id: 1, nome: 'Mercado', cor: '#111111', tipo: 'despesa' as const },
  { id: 2, nome: 'Salário', cor: '#222222', tipo: 'receita' as const },
];

describe('montarRelatorioAnual', () => {
  const lancamentos = [
    lancamento({ natureza: 'receita', valor: 500000, data: '2026-01-05', categoriaId: 2 }),
    lancamento({ valor: 120000, data: '2026-01-10', categoriaId: 1, descricao: 'Supermercado' }),
    lancamento({ natureza: 'receita', valor: 500000, data: '2026-02-05', categoriaId: 2 }),
    lancamento({ valor: 300000, data: '2026-02-10', categoriaId: 1, descricao: 'Compra grande' }),
    // compra no cartão pesa no mês da fatura
    lancamento({ tipo: 'gasto', valor: 50000, data: '2026-02-25', competencia: '2026-03', noCartao: true, cartaoId: 9, descricao: 'Loja' }),
    lancamento({ natureza: 'fatura', valor: 50000, data: '2026-03-10', competencia: '2026-03' }),
    lancamento({ natureza: 'transferencia', valor: 99999, data: '2026-02-15' }),
    lancamento({ natureza: 'guardado', valor: 20000, data: '2026-02-20' }),
    // previsão não entra
    lancamento({ status: 'previsto', valor: 77777, data: '2026-12-10' }),
    // ano anterior, para comparar
    lancamento({ natureza: 'receita', valor: 400000, data: '2025-06-05' }),
    lancamento({ valor: 100000, data: '2025-06-10' }),
  ];
  const r = montarRelatorioAnual({
    ano: 2026,
    lancamentos,
    categorias,
    cartoes: [{ id: 9, nome: 'C6' }],
    membros: [],
    membroId: null,
    contas: [{ nome: 'BB', inicio: 1000, fim: 2000 }],
  });

  it('totais, média só dos meses com dados e taxa de poupança', () => {
    expect(r.total).toEqual({ receitas: 1000000, despesas: 470000, guardado: 20000, sobra: 510000 });
    expect(r.mesesComDados).toBe(3);
    expect(r.mediaMensal).toEqual({ receitas: 333333, despesas: 156667 });
    expect(r.taxaDePoupanca).toBeCloseTo(0.53);
    expect(r.meses.map((m) => m.despesas).slice(0, 4)).toEqual([120000, 300000, 50000, 0]);
    expect(r.meses[11].despesas).toBe(0);
  });

  it('categorias, maiores gastos, cartão, melhor e pior mês, ano anterior', () => {
    expect(r.despesasPorCategoria.map((c) => [c.nome, c.total, Math.round(c.percentual * 100)])).toEqual([
      ['Mercado', 420000, 89],
      ['Sem categoria', 50000, 11],
    ]);
    expect(r.receitasPorCategoria.map((c) => [c.nome, c.total])).toEqual([['Salário', 1000000]]);
    expect(r.maioresGastos.map((g) => g.descricao)).toEqual(['Compra grande', 'Supermercado', 'Loja']);
    expect(r.cartoes).toEqual([{ nome: 'C6', total: 50000 }]);
    expect(r.melhorMes?.mes).toBe('2026-01');
    expect(r.piorMes?.mes).toBe('2026-03');
    expect(r.anoAnterior).toEqual({ receitas: 400000, despesas: 100000, guardado: 0, sobra: 300000 });
  });

  it('gera o HTML do PDF', () => {
    const html = relatorioAnualEmHtml(r, 'Cofre · Relatório de 2026', '20/10/2026');
    expect(html).toContain('Resumo do ano');
    expect(html).toContain('Mercado');
    expect(html).toContain('Saldo das contas');
  });
});
