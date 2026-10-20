import { describe, expect, it } from '@jest/globals';
import { obterLancamentosDoPeriodo, type DadosFinanceiros } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { calcularLivreParaGastar } from '@/domain/usecases/calcularLivreParaGastar';
import {
  umAporte,
  umaCompra,
  umaContaFixa,
  umaFatura,
  umaMovimentacao,
  umaParcela,
  umCartao,
  umCofrinho,
  umGasto,
} from '@/test/fabricas';

const HOJE = '2026-04-15';

/** Abril de 2026, com um cartão que fecha dia 25 e vence dia 5. */
const dados: DadosFinanceiros = {
  cartoes: [umCartao({ id: 1, nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 })],
  contasFixas: [
    umaContaFixa({ id: 1, nome: 'Luz', formaPagamento: 'debito', contaBancariaId: 1, diaVencimento: 10 }),
    umaContaFixa({ id: 2, nome: 'Aluguel', formaPagamento: 'boleto', contaBancariaId: 1, diaVencimento: 20 }),
    umaContaFixa({ id: 3, nome: 'Streaming', formaPagamento: 'cartao', cartaoId: 1, diaVencimento: 28 }),
  ],
  comprasParceladas: [umaCompra({ id: 1, descricao: 'TV', cartaoId: 1, numParcelas: 10 })],
  parcelas: [
    umaParcela({ id: 11, contaFixaId: 1, valor: 12000, mesReferencia: '2026-04' }),
    umaParcela({ id: 12, contaFixaId: 2, valor: 150000, mesReferencia: '2026-04', status: 'paga', dataPagamento: '2026-04-14' }),
    // cobrado em 28/02 → fecha em março → vence em 05/04
    umaParcela({ id: 13, contaFixaId: 3, valor: 3000, mesReferencia: '2026-02' }),
    // fecha em março → vence em 05/04
    umaParcela({ id: 14, compraParceladaId: 1, numero: 3, valor: 30000, mesReferencia: '2026-03', status: 'paga' }),
  ],
  faturas: [umaFatura({ id: 1, cartaoId: 1, mesReferencia: '2026-04', status: 'paga' })],
  movimentacoes: [
    umaMovimentacao({ id: 1, tipo: 'entrada', valor: 500000, data: '2026-04-05', descricao: 'Salário', recorrenteOrigemId: 99 }),
    umaMovimentacao({ id: 2, tipo: 'entrada', valor: 80000, data: '2026-03-30', descricao: 'Freela', reservarProximoMes: true }),
    umaMovimentacao({ id: 3, tipo: 'entrada', valor: 20000, data: '2026-04-25', descricao: 'Reembolso' }),
    umaMovimentacao({ id: 4, tipo: 'saida', valor: 5000, data: '2026-04-03', descricao: 'Farmácia' }),
    umaMovimentacao({ id: 5, tipo: 'transferencia', valor: 30000, data: '2026-04-04', contaDestinoId: 2 }),
    umaMovimentacao({ id: 6, tipo: 'saida', valor: 37000, data: '2026-04-05', descricao: 'Fatura Nubank', origem: 'fatura', faturaId: 1 }),
  ],
  gastos: [
    umGasto({ id: 1, valor: 3000, data: '2026-04-06', formaPagamento: 'debito', contaBancariaId: 1, descricao: 'Padaria' }),
    // até o fechamento de março → fatura de abril
    umGasto({ id: 2, valor: 4000, data: '2026-03-20', formaPagamento: 'cartao', cartaoId: 1, descricao: 'iFood' }),
    // depois do fechamento de abril → fatura de maio
    umGasto({ id: 3, valor: 9000, data: '2026-04-10', formaPagamento: 'cartao', cartaoId: 1, descricao: 'Mercado' }),
  ],
  cofrinhos: [umCofrinho({ id: 1, nome: 'Viagem' })],
  aportesCofrinho: [umAporte({ id: 1, cofrinhoId: 1, valor: 10000, data: '2026-04-08' })],
  movimentacoesReserva: [
    { id: 1, tipo: 'aporte', valor: 20000, data: '2026-04-09', justificativa: null },
    { id: 2, tipo: 'retirada', valor: 5000, data: '2026-04-12', justificativa: 'Conserto' },
  ],
};

const lista = obterLancamentosDoPeriodo('2026-03-01', '2026-04-30', dados, HOJE);
const porId = (id: string) => {
  const item = lista.find((l) => l.id === id);
  if (!item) throw new Error(`sem ${id}`);
  return item;
};

describe('obterLancamentosDoPeriodo', () => {
  it('junta todas as origens numa lista só, em ordem de data e só dentro do período', () => {
    expect(lista.map((l) => l.data)).toEqual([...lista.map((l) => l.data)].sort());
    expect(lista.every((l) => l.data >= '2026-03-01' && l.data <= '2026-04-30')).toBe(true);
    expect(new Set(lista.map((l) => l.tipo))).toEqual(
      new Set(['movimentacao', 'gasto', 'parcela', 'conta_fixa', 'fatura', 'aporte_cofrinho', 'reserva'])
    );
    // a compra de 10/04 vence em maio: fica fora do período, e a fatura de maio também
    expect(lista.some((l) => l.id === 'fatura-1-2026-05')).toBe(false);
  });

  it('a natureza separa receita, despesa, pagamento, transferência e dinheiro guardado', () => {
    expect(porId('mov-1').natureza).toBe('receita');
    expect(porId('mov-4').natureza).toBe('despesa');
    expect(porId('mov-5').natureza).toBe('transferencia');
    expect(porId('mov-6').natureza).toBe('pagamento');
    expect(porId('aporte-1').natureza).toBe('guardado');
    expect(porId('reserva-2')).toMatchObject({ natureza: 'resgate', descricao: 'Retirada da reserva: Conserto' });
  });

  it('status: pago, previsto ou atrasado', () => {
    expect(porId('parcela-11')).toMatchObject({ descricao: 'Luz', data: '2026-04-10', status: 'atrasado' });
    expect(porId('parcela-12')).toMatchObject({ descricao: 'Aluguel', status: 'pago' });
    expect(porId('mov-3').status).toBe('previsto');
    expect(porId('mov-4').status).toBe('pago');
  });

  it('a fatura soma o que é cobrado nela e vence no dia do cartão', () => {
    expect(porId('fatura-1-2026-04')).toMatchObject({
      tipo: 'fatura',
      valor: 4000 + 3000 + 30000,
      data: '2026-04-05',
      competencia: '2026-04',
      status: 'pago',
      link: '/cartao/1',
    });
  });

  it('compras no cartão ficam marcadas noCartao e pesam no mês da fatura', () => {
    expect(porId('gasto-2')).toMatchObject({ noCartao: true, data: '2026-03-20', competencia: '2026-04', cartaoId: 1 });
    expect(porId('parcela-14')).toMatchObject({ descricao: 'TV (3/10)', noCartao: true, competencia: '2026-04' });
    expect(porId('gasto-1')).toMatchObject({ noCartao: false, contaBancariaId: 1 });
  });

  it('entrada reservada para o mês seguinte pesa no orçamento dele; cópia recorrente é marcada', () => {
    expect(porId('mov-2')).toMatchObject({ data: '2026-03-30', competencia: '2026-04' });
    expect(porId('mov-1').origem).toBe('recorrente');
  });

  it('cada lançamento leva para a tela dele', () => {
    expect(porId('mov-4').link).toBe('/movimentacao/4');
    expect(porId('gasto-1').link).toBe('/gasto-rapido/1');
    expect(porId('parcela-11').link).toBe('/conta-fixa/1');
    expect(porId('parcela-14').link).toBe('/compra-parcelada/1');
    expect(porId('aporte-1').link).toBe('/cofrinho/1');
  });
});

describe('calcularLivreParaGastar', () => {
  const livre = calcularLivreParaGastar(lista, '2026-04', HOJE);

  it('separa receitas, contas fixas, faturas, gastos e o que foi guardado', () => {
    expect(livre).toMatchObject({
      receitas: 500000 + 80000 + 20000,
      contasFixas: 12000 + 150000,
      faturas: 37000,
      gastos: 5000 + 3000,
      guardado: 10000 + 20000 - 5000,
    });
  });

  it('livre = receitas − contas fixas − faturas − gastos − guardado; pagamentos e transferências não contam de novo', () => {
    expect(livre.livre).toBe(600000 - 162000 - 37000 - 8000 - 25000);
  });

  it('valor por dia até o fim do mês, contando hoje', () => {
    expect(livre.diasRestantes).toBe(16);
    expect(livre.porDia).toBe(Math.floor(368000 / 16));
  });

  it('mês futuro conta o mês inteiro; mês passado não tem dias', () => {
    expect(calcularLivreParaGastar(lista, '2026-05', HOJE).diasRestantes).toBe(31);
    expect(calcularLivreParaGastar(lista, '2026-03', HOJE).diasRestantes).toBe(0);
  });

  it('sem sobra, valor por dia é zero', () => {
    const apertado = calcularLivreParaGastar(
      obterLancamentosDoPeriodo('2026-04-01', '2026-04-30', { movimentacoes: [umaMovimentacao({ tipo: 'saida', valor: 1000, data: '2026-04-02' })] }, HOJE),
      '2026-04',
      HOJE
    );
    expect(apertado.livre).toBe(-1000);
    expect(apertado.porDia).toBe(0);
  });
});
