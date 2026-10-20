import { describe, expect, it } from '@jest/globals';
import {
  detectarForaDoPadrao,
  importacoesQueDependem,
  resumirImportacao,
} from '@/domain/usecases/importacao/resultadoDaImportacao';
import { umGasto, umaCategoria, umaMovimentacao } from '@/test/fabricas';

const categorias = [umaCategoria({ id: 1, nome: 'Alimentação', cor: '#D97706' }), umaCategoria({ id: 3, nome: 'Moradia', cor: '#40916C' })];

describe('resumirImportacao', () => {
  const movimentacoes = [
    umaMovimentacao({ importacaoId: 5, tipo: 'saida', valor: 4000, data: '2026-10-05', categoriaId: 1, descricao: 'PADARIA' }),
    umaMovimentacao({ importacaoId: 5, tipo: 'saida', valor: 18000, data: '2026-10-12', categoriaId: 3, origem: 'conta_fixa', parcelaId: 9 }),
    umaMovimentacao({ importacaoId: 5, tipo: 'saida', valor: 50000, data: '2026-10-09', origem: 'fatura', faturaId: 4 }),
    umaMovimentacao({ importacaoId: 5, tipo: 'entrada', valor: 500000, data: '2026-10-05' }),
    umaMovimentacao({ importacaoId: 5, tipo: 'transferencia', valor: 10000, data: '2026-10-15' }),
    umaMovimentacao({ importacaoId: 5, tipo: 'saida', valor: 2500, data: '2026-10-18', categoriaId: null, descricao: 'XPTO' }),
    // de antes, fora da importação
    umaMovimentacao({ importacaoId: null, tipo: 'saida', valor: 3000, data: '2026-09-10', categoriaId: 1 }),
  ];

  it('soma entradas, despesas de verdade, pagamentos e transferências', () => {
    const r = resumirImportacao({
      importacao: { id: 5, efeitos: JSON.stringify({ parcelas: [], faturas: [], movimentacoes: [{ id: 1, antes: {} }], regrasCriadas: [] }) },
      movimentacoes,
      gastos: [],
      categorias,
    });
    expect(r).toMatchObject({
      mes: '2026-10',
      entradas: 500000,
      saidas: 6500,
      pagamentos: 68000,
      transferencias: 2,
      contasFixasPagas: 1,
      faturasPagas: 1,
      comparacao: { mes: '2026-10', total: 6500, anterior: 3000 },
    });
    expect(r.porCategoria.map((c) => [c.nome, c.total])).toEqual([
      ['Alimentação', 4000],
      ['Sem categoria', 2500],
    ]);
  });

  it('fatura de cartão: as compras são as despesas', () => {
    const gastos = [
      umGasto({ importacaoId: 6, valor: 1000, data: '2026-10-01', categoriaId: 1, formaPagamento: 'cartao' }),
      umGasto({ importacaoId: 6, valor: 2000, data: '2026-10-02', categoriaId: 1, formaPagamento: 'cartao' }),
    ];
    const r = resumirImportacao({ importacao: { id: 6, efeitos: null }, movimentacoes: [], gastos, categorias });
    expect(r.saidas).toBe(3000);
    expect(r.porCategoria).toEqual([{ categoriaId: 1, nome: 'Alimentação', cor: '#D97706', total: 3000 }]);
  });
});

describe('detectarForaDoPadrao', () => {
  const nome = (id: number | null) => (id === 3 ? 'Moradia' : 'Alimentação');
  const lanc = (id: string, data: string, valor: number, descricao: string, categoriaId: number | null, importacaoId: number | null) => ({
    id,
    data,
    valor,
    descricao,
    categoriaId,
    importacaoId,
  });

  it('mesmo comerciante 50% acima da média', () => {
    const historico = [
      lanc('a', '2026-08-10', 18000, 'ENEL DISTRIBUICAO', 3, null),
      lanc('b', '2026-09-10', 19000, 'ENEL DISTRIBUICAO', 3, null),
    ];
    const r = detectarForaDoPadrao([lanc('n', '2026-10-10', 30000, 'ENEL DISTRIBUICAO', 3, 9)], historico, nome);
    expect(r).toEqual([{ id: 'n', descricao: 'ENEL DISTRIBUICAO', valor: 30000, media: 18500, motivo: '62% acima do normal' }]);
    expect(detectarForaDoPadrao([lanc('n', '2026-10-10', 21000, 'ENEL DISTRIBUICAO', 3, 9)], historico, nome)).toEqual([]);
  });

  it('categoria com o triplo da média por lançamento', () => {
    const historico = ['2026-09-01', '2026-09-08', '2026-09-15'].map((d, i) => lanc(`h${i}`, d, 5000, `LOJA ${i}`, 1, null));
    const r = detectarForaDoPadrao([lanc('n', '2026-10-01', 40000, 'RESTAURANTE CARO', 1, 9)], historico, nome);
    expect(r).toEqual([{ id: 'n', descricao: 'RESTAURANTE CARO', valor: 40000, media: 5000, motivo: '8× o normal em Alimentação' }]);
  });

  it('sem histórico suficiente, nada', () => {
    expect(detectarForaDoPadrao([lanc('n', '2026-10-01', 99999, 'X', 1, 9)], [], nome)).toEqual([]);
  });
});

describe('importacoesQueDependem', () => {
  it('acha a importação que converteu uma linha desta em transferência', () => {
    const outras = [
      { id: 2, arquivo: 'c6.csv', efeitos: JSON.stringify({ parcelas: [], faturas: [], movimentacoes: [{ id: 40, antes: {} }], regrasCriadas: [] }) },
      { id: 3, arquivo: 'pp.csv', efeitos: null },
    ];
    expect(importacoesQueDependem(1, [40, 41], outras)).toEqual([outras[0]]);
    expect(importacoesQueDependem(1, [41], outras)).toEqual([]);
  });
});
