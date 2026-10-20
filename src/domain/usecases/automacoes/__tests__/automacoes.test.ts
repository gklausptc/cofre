import { describe, expect, it } from '@jest/globals';
import {
  alertaDeOrcamento,
  orcamentoDoMes,
  progressoDosOrcamentos,
  situacaoDoOrcamento,
  sugerirOrcamentos,
} from '@/domain/usecases/automacoes/orcamento';
import { aumentoDaCobranca, detectarAssinaturas } from '@/domain/usecases/automacoes/assinaturas';
import {
  custoFixoMensal,
  melhorCartaoParaHoje,
  mesesCobertos,
  mesesDasParcelas,
  simularCompra,
  simularQuitacao,
  sugerirMetaDaReserva,
} from '@/domain/usecases/automacoes/simuladores';
import { lerDivisao, salarioParaDividir, sugerirDivisao } from '@/domain/usecases/automacoes/divisaoSalario';
import { primeiroDiaNegativo } from '@/domain/usecases/automacoes/saldoProjetado';
import { gerarInsights } from '@/domain/usecases/automacoes/insights';
import { buscarLancamentos } from '@/domain/usecases/automacoes/busca';
import { montarFechamentoDoMes, numerosDoMes } from '@/domain/usecases/automacoes/fechamentoDoMes';
import { montarRelatorio, relatorioEmHtml } from '@/domain/usecases/automacoes/relatorio';
import { formatarMoeda } from '@/core/utils/currency';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import { umCartao, umaCategoria, umaCompra, umaConta, umaContaFixa, umaMovimentacao, umaParcela } from '@/test/fabricas';

function lanc(dados: Partial<LancamentoDoPeriodo>): LancamentoDoPeriodo {
  return {
    id: 'mov-1',
    tipo: 'movimentacao',
    natureza: 'despesa',
    status: 'pago',
    valor: 1000,
    data: '2026-10-05',
    competencia: '2026-10',
    descricao: 'X',
    origem: 'manual',
    noCartao: false,
    contaBancariaId: 1,
    cartaoId: null,
    categoriaId: 1,
    membroId: null,
    link: '/movimentacao/1',
    ...dados,
  };
}

const categorias = [
  umaCategoria({ id: 1, nome: 'Alimentação', cor: '#D97706' }),
  umaCategoria({ id: 2, nome: 'Lazer', cor: '#C1443C' }),
  umaCategoria({ id: 8, nome: 'Assinaturas', cor: '#40916C' }),
  umaCategoria({ id: 10, nome: 'Salário', tipo: 'receita' }),
];

describe('orçamento', () => {
  const orcamentos = [
    { id: 1, categoriaId: 1, mesInicio: '2026-01', limite: 80000, apenasNoMes: false },
    { id: 2, categoriaId: 1, mesInicio: '2026-09', limite: 90000, apenasNoMes: false },
    { id: 3, categoriaId: 1, mesInicio: '2026-12', limite: 150000, apenasNoMes: true },
  ];

  it('vale o mais recente que começou até o mês; "só neste mês" tem prioridade', () => {
    expect(orcamentoDoMes(orcamentos, 1, '2026-08')).toBe(80000);
    expect(orcamentoDoMes(orcamentos, 1, '2026-10')).toBe(90000);
    expect(orcamentoDoMes(orcamentos, 1, '2026-12')).toBe(150000);
    expect(orcamentoDoMes(orcamentos, 1, '2027-01')).toBe(90000);
    expect(orcamentoDoMes(orcamentos, 2, '2026-10')).toBeNull();
  });

  it('progresso pela competência (cartão pesa no mês da fatura), sem pagamentos', () => {
    const lancs = [
      lanc({ valor: 50000 }),
      lanc({ valor: 30000, noCartao: true, data: '2026-09-28', competencia: '2026-10' }),
      lanc({ valor: 99999, natureza: 'pagamento' }),
      lanc({ valor: 10000, competencia: '2026-09' }),
    ];
    const r = progressoDosOrcamentos(orcamentos, categorias, lancs, '2026-10');
    expect(r.itens).toEqual([{ categoriaId: 1, nome: 'Alimentação', cor: '#D97706', limite: 90000, gasto: 80000, proporcao: 80000 / 90000, situacao: 'atencao' }]);
    expect(situacaoDoOrcamento(90000, 90000)).toBe('estourado');
    expect(situacaoDoOrcamento(10, 90000)).toBe('ok');
  });

  it('sugestão: média de 3 meses fechados, só com gasto em 2 deles, para cima em R$ 10', () => {
    const lancs = [
      lanc({ competencia: '2026-07', valor: 70000 }),
      lanc({ competencia: '2026-08', valor: 80000 }),
      lanc({ competencia: '2026-09', valor: 91234 }),
      lanc({ competencia: '2026-10', valor: 999999 }),
      lanc({ competencia: '2026-09', valor: 5000, categoriaId: 2 }),
    ];
    expect(sugerirOrcamentos(lancs, categorias, '2026-10')).toEqual([
      { categoriaId: 1, nome: 'Alimentação', sugestao: 81000, media: 80411, meses: ['2026-07', '2026-08', '2026-09'] },
    ]);
  });

  it('alerta em 80% e em 100%, uma vez', () => {
    expect(alertaDeOrcamento(70000, 75000, 90000)).toBe(80);
    expect(alertaDeOrcamento(75000, 85000, 90000)).toBeNull();
    expect(alertaDeOrcamento(85000, 95000, 90000)).toBe(100);
    expect(alertaDeOrcamento(10000, 95000, 90000)).toBe(100);
  });
});

describe('assinaturas', () => {
  it('aumento: 5% e R$ 1 acima da maior das 3 anteriores', () => {
    expect(aumentoDaCobranca([2190, 2190, 2390])).toEqual({ de: 2190, para: 2390, percentual: 9 });
    expect(aumentoDaCobranca([2190, 2290, 2250])).toBeNull();
    expect(aumentoDaCobranca([1000, 1040])).toBeNull();
  });

  it('contas fixas e cobranças repetidas na categoria Assinaturas', () => {
    const contasFixas = [
      umaContaFixa({ id: 5, nome: 'Netflix', valor: 5590, categoriaId: 8 }),
      umaContaFixa({ id: 6, nome: 'Aluguel', valor: 200000, categoriaId: null }),
      umaContaFixa({ id: 7, nome: 'Anuidade', valor: 24000, categoriaId: 8, recorrencia: 'anual' }),
    ];
    const lancamentos = [
      lanc({ tipo: 'conta_fixa', link: '/conta-fixa/5', valor: 5590, data: '2026-09-12', categoriaId: 8 }),
      lanc({ tipo: 'conta_fixa', link: '/conta-fixa/5', valor: 5590, data: '2026-10-12', categoriaId: 8 }),
      lanc({ tipo: 'gasto', descricao: 'SPOTIFY', valor: 2190, data: '2026-08-03', categoriaId: 8 }),
      lanc({ tipo: 'gasto', descricao: 'SPOTIFY', valor: 2190, data: '2026-09-03', categoriaId: 8 }),
      lanc({ tipo: 'gasto', descricao: 'SPOTIFY', valor: 2390, data: '2026-10-03', categoriaId: 8 }),
      lanc({ tipo: 'gasto', descricao: 'APP UMA VEZ', valor: 990, data: '2026-10-03', categoriaId: 8 }),
    ];
    const r = detectarAssinaturas({ lancamentos, contasFixas, categorias, hoje: '2026-10-20' });
    expect(r.itens.map((i) => [i.nome, i.valorMensal, i.contaFixaId, i.aumento?.percentual ?? null])).toEqual([
      ['Netflix', 5590, 5, null],
      ['SPOTIFY', 2390, null, 9],
      ['Anuidade', 2000, 7, null],
    ]);
    expect(r.totalMensal).toBe(5590 + 2390 + 2000);
    expect(r.totalAnual).toBe(r.totalMensal * 12);
  });
});

describe('simuladores', () => {
  const projecao = [
    { mes: '2026-10', receitaPrevista: 500000, despesaPrevista: 300000, saldoPrevisto: 200000 },
    { mes: '2026-11', receitaPrevista: 500000, despesaPrevista: 420000, saldoPrevisto: 80000 },
    { mes: '2026-12', receitaPrevista: 500000, despesaPrevista: 350000, saldoPrevisto: 150000 },
  ];
  const cartao = umCartao({ id: 10, nome: 'C6', diaFechamento: 3, diaVencimento: 10 });

  it('parcelas caem nas faturas certas', () => {
    expect(mesesDasParcelas('2026-10-20', 3, cartao)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(mesesDasParcelas('2026-10-20', 1, null)).toEqual(['2026-10']);
  });

  it('dá, apertado ou não dá, com o mês mais justo', () => {
    const base = { cartao, limiteDisponivel: 1000000, dataCompra: '2026-10-20', projecao };
    expect(simularCompra({ ...base, valor: 30000, parcelas: 1 })).toMatchObject({ veredito: 'da', titulo: 'Dá para comprar' });
    const apertado = simularCompra({ ...base, valor: 60000, parcelas: 1 });
    expect(apertado).toMatchObject({ veredito: 'apertado', titulo: 'Dá, mas novembro fica apertado' });
    expect(apertado.detalhe).toBe(`Sobram ${formatarMoeda(20000)} em novembro (4% da renda).`);
    expect(apertado.alternativa).toBe(2);
    const naoDa = simularCompra({ ...base, valor: 100000, parcelas: 1 });
    expect(naoDa).toMatchObject({ veredito: 'nao_da', detalhe: `Novembro fica ${formatarMoeda(20000)} no negativo.` });
    expect(simularCompra({ ...base, valor: 30000, parcelas: 1, limiteDisponivel: 20000 }).veredito).toBe('nao_da');
    expect(simularCompra({ ...base, valor: 1, parcelas: 1, projecao: projecao.map((p) => ({ ...p, receitaPrevista: 0 })) }).veredito).toBe('sem_renda');
  });

  it('quitação: parcelas que faltam depois do mês atual', () => {
    const compra = umaCompra({ id: 3, descricao: 'TV', cartaoId: 10 });
    const parcelas = [1, 2, 3, 4].map((n) =>
      umaParcela({ compraParceladaId: 3, numero: n, valor: 25000, mesReferencia: `2026-${String(8 + n).padStart(2, '0')}`, status: n === 1 ? 'paga' : 'pendente' })
    );
    expect(simularQuitacao(compra, parcelas, [cartao], '2026-10')).toEqual({
      compraId: 3,
      descricao: 'TV',
      parcelasRestantes: 2,
      totalRestante: 50000,
      liberaPorMes: 25000,
      meses: ['2026-11', '2026-12'],
    });
  });

  it('melhor cartão para hoje: o que dá mais prazo', () => {
    const outro = umCartao({ id: 11, nome: 'PicPay', diaFechamento: 25, diaVencimento: 5 });
    const r = melhorCartaoParaHoje([cartao, outro], '2026-10-20');
    expect(r.map((c) => [c.nome, c.vencimento, c.diasAtePagar])).toEqual([
      ['C6', '2026-11-10', 21],
      ['PicPay', '2026-11-05', 16],
    ]);
    expect(melhorCartaoParaHoje([cartao, outro], '2026-10-20', new Map([[10, 0]])).map((c) => c.nome)).toEqual(['PicPay']);
  });

  it('meta da reserva: 6 meses do custo fixo', () => {
    const custo = custoFixoMensal(
      [umaContaFixa({ valor: 100000 }), umaContaFixa({ valor: 120000, recorrencia: 'anual' })],
      [umaParcela({ compraParceladaId: 1, valor: 30000, mesReferencia: '2026-10' })],
      '2026-10'
    );
    expect(custo).toBe(100000 + 10000 + 10000);
    expect(sugerirMetaDaReserva(custo)).toBe(720000);
    expect(mesesCobertos(300000, custo)).toBe(2.5);
    expect(mesesCobertos(1, 0)).toBeNull();
  });
});

describe('divisão do salário', () => {
  it('acha o salário recente ainda não dividido', () => {
    const movs = [
      umaMovimentacao({ id: 1, tipo: 'entrada', categoriaId: 10, data: '2026-10-05', valor: 500000 }),
      umaMovimentacao({ id: 2, tipo: 'entrada', categoriaId: 10, data: '2026-09-05', valor: 500000 }),
    ];
    expect(salarioParaDividir(movs, categorias, [], '2026-10-08')?.id).toBe(1);
    expect(salarioParaDividir(movs, categorias, [1], '2026-10-08')).toBeNull();
    expect(salarioParaDividir(movs, categorias, [], '2026-10-20')).toBeNull();
  });

  it('10% reserva e 5% cofrinhos, pelo aporte sugerido, com teto do livre para gastar', () => {
    const base = {
      salario: 500000,
      config: lerDivisao(null),
      reserva: { valorAtual: 100000, valorMeta: 600000 },
      cofrinhos: [
        { id: 1, nome: 'Viagem', falta: 400000, aporteSugerido: 30000 },
        { id: 2, nome: 'Carro', falta: 1000000, aporteSugerido: 10000 },
      ],
    };
    expect(sugerirDivisao({ ...base, livreParaGastar: 200000 })).toEqual({
      reserva: 50000,
      cofrinhos: [
        { cofrinhoId: 1, nome: 'Viagem', valor: 18750 },
        { cofrinhoId: 2, nome: 'Carro', valor: 6250 },
      ],
      total: 75000,
      reservaPct: 10,
      cofrinhosPct: 5,
    });
    const curto = sugerirDivisao({ ...base, livreParaGastar: 37500 });
    expect(curto?.total).toBe(37500);
    expect(sugerirDivisao({ ...base, livreParaGastar: -100 })).toBeNull();
    expect(sugerirDivisao({ ...base, reserva: { valorAtual: 600000, valorMeta: 600000 }, livreParaGastar: 200000 })?.reserva).toBe(0);
    expect(lerDivisao('{"reservaPct": 20, "cofrinhosPct": 500}')).toEqual({ ativo: true, reservaPct: 20, cofrinhosPct: 5 });
  });
});

describe('saldo projetado', () => {
  it('primeiro dia em que a conta fica negativa', () => {
    const contas = [umaConta({ id: 1, nomeConta: 'C6' }), umaConta({ id: 2, nomeConta: 'BB' })];
    const r = primeiroDiaNegativo({
      contas,
      saldos: new Map([
        [1, 50000],
        [2, 10000],
      ]),
      lancamentos: [
        lanc({ tipo: 'conta_fixa', status: 'previsto', data: '2026-10-23', valor: 70000, contaBancariaId: 1 }),
        lanc({ tipo: 'movimentacao', natureza: 'receita', status: 'previsto', data: '2026-10-30', valor: 500000, contaBancariaId: 1 }),
        lanc({ tipo: 'fatura', natureza: 'fatura', status: 'previsto', data: '2026-11-10', valor: 5000, cartaoId: 10, contaBancariaId: null }),
      ],
      faturas: [{ cartaoId: 10, contaBancariaId: 2, dataPagamento: '2026-10-10', status: 'paga' }],
      hoje: '2026-10-20',
    });
    expect(r).toEqual([{ contaBancariaId: 1, nomeConta: 'C6', data: '2026-10-23', saldo: -20000 }]);
  });
});

describe('insights', () => {
  it('ordem de importância e "Entendi"', () => {
    const params = {
      negativos: [{ contaBancariaId: 1, nomeConta: 'C6', data: '2026-10-23', saldo: -21000 }],
      orcamentos: [
        { categoriaId: 1, nome: 'Alimentação', cor: '', limite: 90000, gasto: 112000, proporcao: 1.24, situacao: 'estourado' as const },
        { categoriaId: 2, nome: 'Lazer', cor: '', limite: 10000, gasto: 8500, proporcao: 0.85, situacao: 'atencao' as const },
      ],
      mes: '2026-10',
      assinaturas: [],
      foraDoPadrao: [{ id: 'mov-9', descricao: 'Luz', valor: 31200, media: 19500, percentual: 60 }],
      cartoesHoje: [
        { cartaoId: 10, nome: 'C6', vencimento: '2026-12-12', diasAtePagar: 52 },
        { cartaoId: 11, nome: 'PicPay', vencimento: '2026-11-05', diasAtePagar: 16 },
      ],
      hoje: '2026-10-20',
      dispensados: [],
    };
    const r = gerarInsights(params);
    expect(r.map((i) => i.texto)).toEqual([
      `A conta C6 fica negativa dia 23/10: ${formatarMoeda(-21000)}.`,
      `Alimentação passou do orçamento: ${formatarMoeda(112000)} de ${formatarMoeda(90000)}.`,
      `Luz veio ${formatarMoeda(31200)}, 60% acima da média.`,
      `Lazer já usou 85% do orçamento: ${formatarMoeda(8500)} de ${formatarMoeda(10000)}.`,
      'Melhor cartão hoje: C6, vence 12/12 (52 dias).',
    ]);
    expect(gerarInsights({ ...params, dispensados: [r[0].chave] })).toHaveLength(4);
  });
});

describe('busca', () => {
  const lancs = [
    lanc({ id: 'a', descricao: 'Padaria São José', valor: 4590, data: '2026-10-01' }),
    lanc({ id: 'b', descricao: 'Mercado', valor: 12000, data: '2026-10-02', categoriaId: 2 }),
    lanc({ id: 'c', descricao: 'Fatura C6', natureza: 'fatura', valor: 4590 }),
  ];
  it('texto sem acento, valor e categoria', () => {
    expect(buscarLancamentos(lancs, { texto: 'sao jose' }).map((l) => l.id)).toEqual(['a']);
    expect(buscarLancamentos(lancs, { texto: '45,90' }).map((l) => l.id)).toEqual(['a']);
    expect(buscarLancamentos(lancs, { texto: '', categoriaId: 2 }).map((l) => l.id)).toEqual(['b']);
    expect(buscarLancamentos(lancs, { texto: '', inicio: '2026-10-02' }).map((l) => l.id)).toEqual(['b']);
  });
});

describe('fechamento do mês e relatório', () => {
  const lancs = [
    lanc({ natureza: 'receita', valor: 500000, categoriaId: 10 }),
    lanc({ valor: 60000, categoriaId: 1 }),
    lanc({ valor: 20000, categoriaId: 2 }),
    lanc({ tipo: 'conta_fixa', valor: 100000, categoriaId: null, status: 'pago' }),
    lanc({ tipo: 'conta_fixa', valor: 50000, categoriaId: null, status: 'atrasado' }),
    lanc({ tipo: 'reserva', natureza: 'guardado', valor: 30000, categoriaId: null }),
    lanc({ tipo: 'aporte_cofrinho', natureza: 'guardado', valor: 10000, categoriaId: null }),
    lanc({ valor: 50000, categoriaId: 2, competencia: '2026-09', data: '2026-09-10' }),
    lanc({ valor: 40000, categoriaId: 2, competencia: '2026-08', data: '2026-08-10' }),
  ];
  const orcamentos = [{ id: 1, categoriaId: 1, mesInicio: '2026-01', limite: 50000, apenasNoMes: false }];

  it('números do mês', () => {
    expect(numerosDoMes(lancs, '2026-10')).toEqual({ receitas: 500000, despesas: 230000, guardado: 40000, sobra: 230000 });
  });

  it('o que deu certo, acima do orçamento, contas pagas e guardado', () => {
    const f = montarFechamentoDoMes({ mes: '2026-10', lancamentos: lancs, orcamentos, categorias });
    expect(f.acimaDoOrcamento.map((o) => o.nome)).toEqual(['Alimentação']);
    expect(f.deuCerto).toEqual([{ categoriaId: 2, nome: 'Lazer', gasto: 20000, referencia: 30000, motivo: 'abaixo da média' }]);
    expect(f.contasPagas).toEqual({ pagas: 1, total: 2 });
    expect(f.guardado).toEqual({ reserva: 30000, cofrinhos: 10000 });
  });

  it('relatório em HTML escapa o texto e tem as seções', () => {
    const r = montarRelatorio({
      mes: '2026-10',
      lancamentos: [...lancs, lanc({ descricao: 'Loja <b>&</b>', valor: 100, categoriaId: 1 })],
      categorias,
      orcamentos,
      membros: [],
      membroId: null,
      contas: [{ nome: 'C6', inicio: 100000, fim: 120000 }],
      projecao: [{ mes: '2026-11', receitaPrevista: 0, despesaPrevista: 50000, saldoPrevisto: -50000 }],
      incluirLancamentos: true,
      agora: new Date(2026, 9, 20, 10, 0),
      nomeDoApp: 'Cofre Klaus',
    });
    expect(r.titulo).toBe('Cofre Klaus · Relatório de outubro de 2026');
    const html = relatorioEmHtml(r);
    expect(html).toContain('Loja &lt;b&gt;&amp;&lt;/b&gt;');
    expect(html).not.toContain('<b>&</b>');
    for (const secao of ['Resumo', 'Saldo por conta', 'Despesas por categoria', 'Receita × despesa (6 meses)', 'Comprometido nos próximos 12 meses', 'Lançamentos']) {
      expect(html).toContain(`<h2>${secao}`);
    }
  });
});
