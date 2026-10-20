/**
 * Regras de integração do Cofre 2.0 (Fase 1): as funcionalidades conversam entre si.
 */
import { describe, expect, it } from '@jest/globals';
import { calcularPagamentosDoMes } from '@/domain/usecases/calcularPagamentosDoMes';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';
import { calcularResumoMensal } from '@/domain/usecases/calcularResumoMensal';
import { calcularGastosPorCategoria } from '@/domain/usecases/calcularGastosPorCategoria';
import { calcularSaldoTotal } from '@/domain/usecases/calcularSaldoConta';
import { ehDespesa, ehPagamentoDeCompromisso } from '@/domain/usecases/naturezaMovimentacao';
import { planejarPagamentoContaFixa } from '@/domain/usecases/pagarFatura';
import { umaCategoria, umaConta, umaContaFixa, umaFatura, umaMovimentacao, umaParcela, umCartao, umGasto } from '@/test/fabricas';

const nubank = umCartao({ id: 1, nome: 'Nubank', limite: 500000, diaFechamento: 25, diaVencimento: 5 });

describe('pagamento de compromisso', () => {
  it('saída que paga fatura ou conta fixa não é despesa (a despesa já foi contada)', () => {
    const fatura = umaMovimentacao({ tipo: 'saida', origem: 'fatura', faturaId: 1 });
    const contaFixa = umaMovimentacao({ tipo: 'saida', origem: 'conta_fixa', parcelaId: 9 });
    const mercado = umaMovimentacao({ tipo: 'saida' });

    expect([fatura, contaFixa, mercado].map(ehPagamentoDeCompromisso)).toEqual([true, true, false]);
    expect([fatura, contaFixa, mercado].map(ehDespesa)).toEqual([false, false, true]);
  });

  it('pagar a fatura não conta em dobro no resumo do mês nem nos gastos por categoria', () => {
    const mercado = umaCategoria({ id: 1, nome: 'Mercado' });
    const gastos = [umGasto({ valor: 30000, data: '2026-04-02', categoriaId: 1, formaPagamento: 'cartao', cartaoId: 1 })];
    const movimentacoes = [
      umaMovimentacao({ tipo: 'saida', valor: 30000, data: '2026-04-05', origem: 'fatura', faturaId: 1, descricao: 'Fatura Nubank' }),
    ];

    expect(calcularResumoMensal(movimentacoes, gastos, '2026-04').despesas).toBe(30000);
    expect(calcularGastosPorCategoria(movimentacoes, gastos, [mercado], '2026-04')).toEqual([
      { categoriaId: 1, nome: 'Mercado', cor: mercado.cor, total: 30000 },
    ]);
  });
});

describe('conta fixa paga', () => {
  const luz = umaContaFixa({ id: 1, nome: 'Luz', formaPagamento: 'debito', contaBancariaId: 1, diaVencimento: 10 });

  it('some de "a pagar" no mês e gera a saída na conta', () => {
    const pendente = umaParcela({ id: 5, contaFixaId: 1, valor: 15000, mesReferencia: '2026-04' });
    const antes = calcularPagamentosDoMes([luz], [pendente], [], [], [], [], '2026-04');
    expect(antes.totalPendente).toBe(15000);

    const plano = planejarPagamentoContaFixa(pendente, luz, '2026-04-10');
    const paga = { ...pendente, status: 'paga' as const, dataPagamento: plano.dataPagamento };
    const depois = calcularPagamentosDoMes([luz], [paga], [], [], [], [], '2026-04');
    expect(depois.totalPendente).toBe(0);
    expect(depois.totalPago).toBe(15000);

    const conta = umaConta({ id: 1, saldoInicial: 100000 });
    const saida = umaMovimentacao({ ...plano.saida, id: 1, parcelaId: 5 });
    expect(calcularSaldoTotal([conta], [saida])).toBe(85000);
  });
});

describe('gasto no cartão', () => {
  const gasto = umGasto({ formaPagamento: 'cartao', cartaoId: 1, valor: 12000, data: '2026-03-20' });

  it('entra na fatura certa pelo dia de fechamento', () => {
    const pagamentos = calcularPagamentosDoMes([], [], [], [nubank], [gasto], [], '2026-04');
    expect(pagamentos.grupos.map((g) => [g.titulo, g.total])).toEqual([['Fatura Nubank', 12000]]);
  });

  it('reduz o limite disponível até a fatura ser paga, e pagar libera o limite', () => {
    expect(calcularLimiteDisponivel(nubank, [], [], [gasto], [])).toBe(488000);

    const faturaPaga = umaFatura({ cartaoId: 1, mesReferencia: '2026-04', status: 'paga' });
    expect(calcularLimiteDisponivel(nubank, [], [], [gasto], [faturaPaga])).toBe(500000);
  });

  it('fatura paga de outro mês não libera a compra desta fatura', () => {
    const outraPaga = umaFatura({ cartaoId: 1, mesReferencia: '2026-03', status: 'paga' });
    expect(calcularLimiteDisponivel(nubank, [], [], [gasto], [outraPaga])).toBe(488000);
  });
});

describe('transferência entre contas próprias', () => {
  it('não é receita nem despesa no resumo do mês', () => {
    const transferencia = umaMovimentacao({ tipo: 'transferencia', valor: 50000, data: '2026-04-10', contaDestinoId: 2 });
    expect(calcularResumoMensal([transferencia], [], '2026-04')).toMatchObject({ receitas: 0, despesas: 0 });
  });
});
