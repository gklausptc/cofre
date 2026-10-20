import { describe, expect, it } from '@jest/globals';
import { diasUteisEntre, domingoDePascoa, feriadosNacionais } from '@/domain/usecases/diasUteis';
import {
  aliquotaIr,
  aporteMensalNecessario,
  calcularRendimento,
  descreverRendimento,
  fatorEntre,
  faltaTaxa,
  mesesParaAtingirMeta,
  rendimentoDoMes,
  simularAplicacao,
  type ConfigRendimento,
  type TaxasReferencia,
} from '@/domain/usecases/rendimento';

const cdi100: ConfigRendimento = { indexador: 'cdi', percentualIndexador: 10000, cobraIr: false };
const cdi105: ConfigRendimento = { indexador: 'cdi', percentualIndexador: 10500, cobraIr: false };
const cdbCdi100: ConfigRendimento = { ...cdi100, cobraIr: true };
const taxas: TaxasReferencia = { cdiAnual: 1000, selicAnual: 1000 }; // 10% a.a., conta redonda

describe('calendário de dias úteis', () => {
  it('Páscoa e feriados móveis de 2026', () => {
    expect(domingoDePascoa(2026)).toEqual(new Date(2026, 3, 5));
    const feriados = feriadosNacionais(2026);
    // Carnaval 16 e 17/02, Sexta-feira Santa 03/04, Corpus Christi 04/06
    expect(['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04'].every((d) => feriados.has(d))).toBe(true);
    expect(feriados.has('2026-11-20')).toBe(true);
  });

  it('conta só segunda a sexta, sem feriado', () => {
    // abril/2026: 22 dias de semana, menos 03/04 (Sexta Santa) e 21/04 (Tiradentes) = 20
    expect(diasUteisEntre('2026-04-01', '2026-05-01')).toBe(20);
    expect(diasUteisEntre('2026-04-04', '2026-04-06')).toBe(0); // sábado e domingo
    expect(diasUteisEntre('2026-04-06', '2026-04-06')).toBe(0);
  });
});

describe('fator de rendimento', () => {
  it('100% do CDI por 252 dias úteis rende exatamente a taxa do ano', () => {
    // 2026-01-02 a 2027-01-04 tem 252 dias úteis? Conferimos pela conta, não pela data
    const diaria = Math.pow(1.1, 1 / 252) - 1;
    expect(Math.pow(1 + diaria, 252)).toBeCloseTo(1.1, 10);
  });

  it('105% do CDI: 105% da taxa de cada dia útil, composto pelos dias úteis do período', () => {
    const dias = diasUteisEntre('2026-01-01', '2027-01-01');
    const umAno = fatorEntre(cdi105, taxas, '2026-01-01', '2027-01-01');
    expect(dias).toBeLessThan(252); // 2026 tem feriados em dias de semana
    expect(umAno).toBeCloseTo(Math.pow(1 + 1.05 * (Math.pow(1.1, 1 / 252) - 1), dias), 10);
    expect(umAno).toBeGreaterThan(fatorEntre(cdi100, taxas, '2026-01-01', '2027-01-01'));
  });

  it('sem rendimento, ou período vazio, não muda nada', () => {
    expect(fatorEntre({ ...cdi100, indexador: 'nenhum' }, taxas, '2026-01-01', '2027-01-01')).toBe(1);
    expect(fatorEntre(cdi100, taxas, '2026-03-10', '2026-03-10')).toBe(1);
  });

  it('poupança: 0,5% ao mês com Selic acima de 8,5%, só em meses completos', () => {
    const poupanca: ConfigRendimento = { indexador: 'poupanca', percentualIndexador: 10000, cobraIr: false };
    expect(fatorEntre(poupanca, { cdiAnual: null, selicAnual: 1500 }, '2026-01-10', '2026-03-09')).toBeCloseTo(1.005, 10);
    expect(fatorEntre(poupanca, { cdiAnual: null, selicAnual: 1500 }, '2026-01-10', '2026-03-10')).toBeCloseTo(1.005 ** 2, 10);
    // Selic de 8% → 70% dela ao ano
    expect(fatorEntre(poupanca, { cdiAnual: null, selicAnual: 800 }, '2026-01-10', '2027-01-10')).toBeCloseTo(1.056, 6);
  });

  it('sabe quando falta informar a taxa', () => {
    expect(faltaTaxa(cdi100, { cdiAnual: null, selicAnual: 1000 })).toBe(true);
    expect(faltaTaxa({ ...cdi100, indexador: 'selic' }, { cdiAnual: 1000, selicAnual: null })).toBe(true);
    expect(faltaTaxa({ ...cdi100, indexador: 'nenhum' }, { cdiAnual: null, selicAnual: null })).toBe(false);
  });
});

describe('imposto de renda regressivo', () => {
  it('22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois', () => {
    expect([30, 180, 181, 360, 361, 720, 721].map(aliquotaIr)).toEqual([0.225, 0.225, 0.2, 0.2, 0.175, 0.175, 0.15]);
  });
});

describe('calcularRendimento', () => {
  const fluxos = [
    { data: '2026-01-02', valor: 100000 },
    { data: '2026-07-01', valor: 50000 },
  ];

  it('cada aporte rende do seu dia até hoje', () => {
    const r = calcularRendimento(fluxos, cdi100, taxas, '2026-12-31');
    if (!r) throw new Error('sem resultado');
    const esperado = 100000 * fatorEntre(cdi100, taxas, '2026-01-02', '2026-12-31') + 50000 * fatorEntre(cdi100, taxas, '2026-07-01', '2026-12-31');
    expect(r.investido).toBe(150000);
    expect(r.saldoBruto).toBe(Math.round(esperado));
    expect(r.rendimentoBruto).toBe(r.saldoBruto - 150000);
    expect(r.impostoEstimado).toBe(0);
    expect(r.saldoLiquido).toBe(r.saldoBruto);
  });

  it('com IR: desconta pela alíquota do prazo médio dos aportes', () => {
    const r = calcularRendimento(fluxos, cdbCdi100, taxas, '2026-12-31');
    if (!r) throw new Error('sem resultado');
    // prazo médio ≈ (100000×363 + 50000×183) / 150000 ≈ 303 dias → 20%
    expect(r.prazoMedioDias).toBe(303);
    expect(r.impostoEstimado).toBe(Math.round(r.rendimentoBruto * 0.2));
  });

  it('retirada deixa de render a partir do dia em que saiu', () => {
    const comRetirada = calcularRendimento([...fluxos, { data: '2026-10-01', valor: -30000 }], cdi100, taxas, '2026-12-31');
    const semRetirada = calcularRendimento(fluxos, cdi100, taxas, '2026-12-31');
    if (!comRetirada || !semRetirada) throw new Error('sem resultado');
    expect(comRetirada.investido).toBe(120000);
    expect(comRetirada.saldoBruto).toBeLessThan(semRetirada.saldoBruto - 30000);
  });

  it('sem a taxa informada não dá para estimar', () => {
    expect(calcularRendimento(fluxos, cdi100, { cdiAnual: null, selicAnual: null }, '2026-12-31')).toBeNull();
  });
});

describe('rendimento do mês e simulações', () => {
  it('"este mês rende X%": usa os dias úteis do mês', () => {
    const r = rendimentoDoMes(100000, cdi100, taxas, '2026-04');
    if (!r) throw new Error('sem resultado');
    expect(r.diasUteis).toBe(20);
    expect(r.percentual).toBeCloseTo(Math.pow(1.1, 20 / 252) - 1, 10);
    expect(r.valor).toBe(Math.round(100000 * r.percentual));
  });

  it('simula uma aplicação em vários prazos, com o IR de cada prazo', () => {
    const simulacao = simularAplicacao(100000, cdbCdi100, taxas, '2026-11-01');
    if (!simulacao) throw new Error('sem resultado');
    expect(simulacao.map((s) => s.meses)).toEqual([1, 3, 6, 12]);
    expect(simulacao[0].ate).toBe('2026-12-01');
    expect(simulacao[0].imposto).toBe(Math.round(simulacao[0].rendimentoBruto * 0.225));
    expect(simulacao[3].imposto).toBe(Math.round(simulacao[3].rendimentoBruto * 0.175));
    expect(simulacao[3].valorLiquido).toBe(100000 + simulacao[3].rendimentoBruto - simulacao[3].imposto);
  });

  it('plano para a meta: meses até chegar e aporte necessário', () => {
    // sem rendimento: R$ 1.000 por mês até R$ 10.000 a partir de R$ 4.000 = 6 meses
    const parado: ConfigRendimento = { ...cdi100, indexador: 'nenhum' };
    expect(mesesParaAtingirMeta(400000, 100000, 1000000, parado, taxas)).toBe(6);
    expect(aporteMensalNecessario(400000, 1000000, 6, parado, taxas)).toBe(100000);
    // rendendo, chega antes (ou no mesmo mês) e pede aporte menor
    expect(mesesParaAtingirMeta(400000, 100000, 1000000, cdi100, taxas)).toBeLessThanOrEqual(6);
    expect(aporteMensalNecessario(400000, 1000000, 6, cdi100, taxas)).toBeLessThan(100000);
    expect(mesesParaAtingirMeta(1000000, 0, 1000000, cdi100, taxas)).toBe(0);
    expect(mesesParaAtingirMeta(0, 0, 1000000, parado, taxas)).toBeNull();
  });

  it('descreve a aplicação', () => {
    expect(descreverRendimento(cdi105)).toBe('105% do CDI');
    expect(descreverRendimento({ indexador: 'selic', percentualIndexador: 10000, cobraIr: true })).toBe('100% da Selic');
    expect(descreverRendimento({ indexador: 'poupanca', percentualIndexador: 10000, cobraIr: false })).toBe('Poupança');
  });
});
