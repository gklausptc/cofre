/**
 * Cenário de duas contas usado nos testes de saldo e de extrato exportado: tem de tudo
 * que mexe no saldo (entradas, saídas, transferências, gastos em débito/pix, contas fixas
 * pagas e faturas pagas) e também o que NÃO deve mexer (cartão, dinheiro, pendentes, outra conta).
 */
import { umaConta, umaContaFixa, umaFatura, umaMovimentacao, umaParcela, umCartao, umGasto } from './fabricas';

export const contaPrincipal = umaConta({ id: 1, nomeConta: 'Principal', saldoInicial: 100000 });
export const contaSecundaria = umaConta({ id: 2, nomeConta: 'Secundária', saldoInicial: 0 });

export const cartoesDoCenario = [umCartao({ id: 1, nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 })];

export const movimentacoesDoCenario = [
  umaMovimentacao({ id: 1, contaBancariaId: 1, tipo: 'entrada', valor: 50000, data: '2026-03-05', descricao: 'Salário' }),
  umaMovimentacao({ id: 2, contaBancariaId: 1, tipo: 'saida', valor: 20000, data: '2026-03-10', descricao: 'Aluguel' }),
  umaMovimentacao({ id: 3, contaBancariaId: 1, tipo: 'transferencia', valor: 10000, data: '2026-03-12', contaDestinoId: 2 }),
  umaMovimentacao({ id: 4, contaBancariaId: 2, tipo: 'transferencia', valor: 5000, data: '2026-04-02', contaDestinoId: 1 }),
  umaMovimentacao({ id: 5, contaBancariaId: 2, tipo: 'entrada', valor: 99900, data: '2026-04-03' }),
];

export const gastosDoCenario = [
  umGasto({ id: 1, valor: 3000, formaPagamento: 'debito', contaBancariaId: 1, data: '2026-03-15', descricao: 'Padaria' }),
  umGasto({ id: 2, valor: 2000, formaPagamento: 'pix', contaBancariaId: 1, data: '2026-04-01' }),
  umGasto({ id: 3, valor: 1000, formaPagamento: 'dinheiro', data: '2026-04-01' }),
  umGasto({ id: 4, valor: 4000, formaPagamento: 'cartao', cartaoId: 1, data: '2026-04-01' }),
  umGasto({ id: 5, valor: 500, formaPagamento: 'debito', contaBancariaId: 2, data: '2026-04-01' }),
];

export const contasFixasDoCenario = [
  umaContaFixa({ id: 10, nome: 'Internet', formaPagamento: 'debito', contaBancariaId: 1, diaVencimento: 20 }),
  umaContaFixa({ id: 11, nome: 'Streaming', formaPagamento: 'cartao', cartaoId: 1 }),
  umaContaFixa({ id: 12, nome: 'Escola', formaPagamento: 'boleto', contaBancariaId: 2 }),
];

export const parcelasDoCenario = [
  umaParcela({ id: 1, contaFixaId: 10, valor: 7000, mesReferencia: '2026-03', status: 'paga', dataPagamento: '2026-03-20' }),
  umaParcela({ id: 2, contaFixaId: 10, valor: 7000, mesReferencia: '2026-04' }),
  umaParcela({ id: 3, contaFixaId: 11, valor: 1500, mesReferencia: '2026-03', status: 'paga', dataPagamento: '2026-03-20' }),
  umaParcela({ id: 4, contaFixaId: 12, valor: 900, mesReferencia: '2026-03', status: 'paga', dataPagamento: '2026-03-20' }),
];

export const faturasDoCenario = [
  umaFatura({ id: 1, cartaoId: 1, status: 'paga', contaBancariaId: 1, valorPago: 30000, dataPagamento: '2026-04-05' }),
  umaFatura({ id: 2, cartaoId: 1, status: 'paga', contaBancariaId: 2, valorPago: 4000, dataPagamento: '2026-04-05' }),
  umaFatura({ id: 3, cartaoId: 1, status: 'aberta', contaBancariaId: 1 }),
];

/**
 * Valores em centavos; em reais, a conta fica assim.
 * Principal: 1000 + 500 − 200 − 100 (transferência enviada) + 50 (recebida) − 30 − 20 (débito/pix)
 *            − 70 (Internet paga) − 300 (fatura paga) = 830
 */
export const SALDO_ESPERADO_PRINCIPAL = 83000;
/** Secundária: 0 + 100 − 50 + 999 − 5 − 9 (Escola paga) − 40 (fatura paga) = 995 */
export const SALDO_ESPERADO_SECUNDARIA = 99500;
