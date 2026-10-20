import { describe, expect, it } from '@jest/globals';
import { projetarFluxoCaixa } from '@/domain/usecases/projetarFluxoCaixa';
import { umaCompra, umaContaFixa, umaMovimentacao, umaParcela, umCartao, umGasto } from '@/test/fabricas';

const hoje = new Date(2026, 2, 15); // março de 2026
const cartao = umCartao({ id: 1, diaFechamento: 25, diaVencimento: 5 });
const compra = umaCompra({ id: 1, cartaoId: 1 });
const luz = umaContaFixa({ id: 1, formaPagamento: 'debito', diaVencimento: 10 });

const movimentacoes = [
  // salário recorrente lançado em janeiro: vale para todo mês a partir dali
  umaMovimentacao({ id: 1, tipo: 'entrada', valor: 500000, data: '2026-01-05', recorrente: true }),
  // cópia gerada automaticamente em março: já representada pelo modelo, não conta em dobro
  umaMovimentacao({ id: 2, tipo: 'entrada', valor: 500000, data: '2026-03-05', recorrenteOrigemId: 1 }),
  umaMovimentacao({ id: 3, tipo: 'entrada', valor: 30000, data: '2026-04-10' }),
  // recebida no fim de março, reservada para abril
  umaMovimentacao({ id: 4, tipo: 'entrada', valor: 100000, data: '2026-03-28', reservarProximoMes: true }),
  umaMovimentacao({ id: 5, tipo: 'saida', valor: 99900, data: '2026-03-20' }),
];

const parcelas = [
  umaParcela({ contaFixaId: 1, valor: 10000, mesReferencia: '2026-03' }),
  // fecha em março, vence em abril
  umaParcela({ compraParceladaId: 1, valor: 20000, mesReferencia: '2026-03' }),
  umaParcela({ compraParceladaId: 1, valor: 20000, mesReferencia: '2026-04', status: 'paga' }),
];

// comprado depois do fechamento de março → fecha em abril → vence em maio
const gastos = [
  umGasto({ formaPagamento: 'cartao', cartaoId: 1, valor: 5000, data: '2026-03-28' }),
  umGasto({ formaPagamento: 'debito', valor: 7700, data: '2026-03-28' }),
];

describe('projetarFluxoCaixa', () => {
  const projecao = projetarFluxoCaixa(3, parcelas, movimentacoes, gastos, [luz], [compra], [cartao], hoje);

  it('projeta o número de meses pedido a partir do mês atual', () => {
    expect(projecao.map((m) => m.mes)).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('receita: recorrente todo mês, avulsa no seu mês, reservada no mês seguinte', () => {
    expect(projecao.map((m) => m.receitaPrevista)).toEqual([500000, 630000, 500000]);
  });

  it('despesa: parcelas pendentes e compras no cartão no mês em que são pagas', () => {
    expect(projecao.map((m) => m.despesaPrevista)).toEqual([10000, 20000, 5000]);
  });

  it('saldo previsto = receita − despesa de cada mês', () => {
    expect(projecao.map((m) => m.saldoPrevisto)).toEqual([490000, 610000, 495000]);
  });
});
