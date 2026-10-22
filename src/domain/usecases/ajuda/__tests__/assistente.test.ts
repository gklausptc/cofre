import { describe, expect, it } from '@jest/globals';
import { responderNoAssistente, type ContextoDoAssistente } from '@/domain/usecases/ajuda/assistente';
import { formatarMoeda } from '@/core/utils/currency';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

let n = 0;
function lanc(dados: Partial<LancamentoDoPeriodo>): LancamentoDoPeriodo {
  const data = dados.data ?? '2026-10-10';
  return {
    id: `l${++n}`,
    tipo: 'movimentacao',
    natureza: 'despesa',
    status: 'pago',
    valor: 1000,
    data,
    competencia: data.slice(0, 7),
    descricao: 'Algo',
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

const ctx: ContextoDoAssistente = {
  hoje: '2026-10-20',
  categorias: [
    { id: 1, nome: 'Mercado', tipo: 'despesa' },
    { id: 2, nome: 'Delivery', tipo: 'despesa' },
    { id: 3, nome: 'Salário', tipo: 'receita' },
  ],
  contas: [
    { id: 1, nome: 'BB corrente', saldo: 150000 },
    { id: 2, nome: 'C6 conta', saldo: 50000 },
  ],
  cartoes: [{ id: 9, nome: 'C6 Carbon' }],
  livre: { mes: '2026-10', sobra: 0, receitas: 500000, contasFixas: 100000, faturas: 80000, gastos: 50000, guardado: 0, livre: 270000, diasRestantes: 12, porDia: 22500 },
  lancamentos: [
    lanc({ categoriaId: 1, valor: 30000, descricao: 'SONDA SUPERMERCADOS' }),
    lanc({ categoriaId: 1, valor: 12000, descricao: 'MERCADINHO', data: '2026-10-15' }),
    lanc({ categoriaId: 2, valor: 4500, descricao: 'IFOOD', data: '2026-10-18' }),
    lanc({ categoriaId: 1, valor: 9999, descricao: 'SONDA', data: '2026-09-05' }),
    lanc({ natureza: 'receita', categoriaId: 3, valor: 500000, descricao: 'SALARIO', data: '2026-10-05' }),
    lanc({ natureza: 'fatura', status: 'previsto', valor: 80000, descricao: 'Fatura C6 Carbon', data: '2026-11-10', competencia: '2026-11', cartaoId: 9 }),
  ],
};

const resposta = (pergunta: string) => responderNoAssistente(pergunta, ctx).texto;

describe('assistente', () => {
  it('quanto gastei, com o quê e quando', () => {
    expect(resposta('Quanto gastei este mês?')).toContain(formatarMoeda(46500));
    expect(resposta('quanto gastei com mercado')).toBe(`Com Mercado este mês: ${formatarMoeda(42000)} em 2 lançamentos.`);
    expect(resposta('quanto gastei com mercado em setembro?')).toContain(formatarMoeda(9999));
    expect(resposta('quanto gastei no ifood')).toContain(formatarMoeda(4500));
    expect(resposta('quanto gastei com academia')).toContain('Não achei');
  });

  it('saldo, livre para gastar, fatura, maior gasto e receita', () => {
    expect(resposta('qual o meu saldo?')).toContain(formatarMoeda(200000));
    expect(resposta('saldo do C6')).toBe(`C6 conta: ${formatarMoeda(50000)}.`);
    expect(resposta('quanto posso gastar?')).toContain(formatarMoeda(270000));
    expect(resposta('quando vence a fatura?')).toContain('10/11/2026');
    expect(resposta('qual foi meu maior gasto?')).toContain('SONDA SUPERMERCADOS');
    expect(resposta('quanto recebi este mês')).toContain(formatarMoeda(500000));
  });

  it('dúvidas de uso e como exportar', () => {
    expect(resposta('como exportar o extrato do Nubank?')).toContain('Nubank');
    expect(responderNoAssistente('como juntar categorias', ctx).acoes[0].href).toBe('/categorias');
    expect(responderNoAssistente('meu pdf tem senha', ctx).acoes[0].href).toBe('/importar-extrato');
    expect(resposta('blablabla')).toContain('Não entendi');
  });
});
