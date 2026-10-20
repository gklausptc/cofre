/**
 * Cenário de abril/2026 com um cartão que fecha dia 25 e vence dia 5, usado nos testes do
 * que há para pagar no mês: conta fixa no débito, conta fixa no cartão, parcela de compra
 * e compras à vista no cartão — cada uma caindo em abril por um caminho diferente.
 */
import { umaCompra, umaContaFixa, umaParcela, umCartao, umGasto } from './fabricas';

export const MES = '2026-04';

export const nubank = umCartao({ id: 1, nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 });

export const luz = umaContaFixa({ id: 1, nome: 'Luz', formaPagamento: 'debito', diaVencimento: 10 });
export const streaming = umaContaFixa({ id: 2, nome: 'Streaming', formaPagamento: 'cartao', cartaoId: 1, diaVencimento: 28 });

export const tv = umaCompra({ id: 1, descricao: 'TV', cartaoId: 1, numParcelas: 10 });

export const parcelasDoMes = [
  // Luz de abril, já paga
  umaParcela({ id: 1, contaFixaId: 1, valor: 10000, mesReferencia: '2026-04', status: 'paga', dataPagamento: '2026-04-10' }),
  // Streaming de fevereiro: cobrado dia 28/02 → fecha em março → vence em abril
  umaParcela({ id: 2, contaFixaId: 2, valor: 5000, mesReferencia: '2026-02' }),
  // Streaming de março: cobrado 28/03 → fecha em abril → vence em maio (fora)
  umaParcela({ id: 3, contaFixaId: 2, valor: 5000, mesReferencia: '2026-03' }),
  // TV 3/10: fecha em março → vence em abril
  umaParcela({ id: 4, compraParceladaId: 1, numero: 3, valor: 30000, mesReferencia: '2026-03' }),
];

export const gastosDoMes = [
  // até o dia 25 de março → fatura que vence em abril
  umGasto({ id: 1, formaPagamento: 'cartao', cartaoId: 1, valor: 4000, data: '2026-03-20', descricao: 'iFood' }),
  umGasto({ id: 2, formaPagamento: 'cartao', cartaoId: 1, valor: 6000, data: '2026-03-10', descricao: 'Mercado' }),
  // depois do fechamento → fatura de maio (fora)
  umGasto({ id: 3, formaPagamento: 'cartao', cartaoId: 1, valor: 99900, data: '2026-03-26' }),
  umGasto({ id: 4, formaPagamento: 'debito', valor: 1500, data: '2026-04-02' }),
];
