import { describe, expect, it } from '@jest/globals';
import { calcularSaldoConta, calcularSaldoTotal, efeitoMovimentacaoNaConta } from '@/domain/usecases/calcularSaldoConta';
import { umaMovimentacao } from '@/test/fabricas';
import {
  contaPrincipal,
  contaSecundaria,
  gastosDoCenario,
  movimentacoesDoCenario,
  movimentacoesManuaisDoCenario,
  SALDO_ESPERADO_PRINCIPAL,
  SALDO_ESPERADO_SECUNDARIA,
} from '@/test/cenarioConta';

describe('efeitoMovimentacaoNaConta', () => {
  it('entrada soma, saída e transferência enviada tiram, transferência recebida soma', () => {
    expect(efeitoMovimentacaoNaConta(1, umaMovimentacao({ contaBancariaId: 1, tipo: 'entrada', valor: 1000 }))).toBe(1000);
    expect(efeitoMovimentacaoNaConta(1, umaMovimentacao({ contaBancariaId: 1, tipo: 'saida', valor: 1000 }))).toBe(-1000);
    expect(
      efeitoMovimentacaoNaConta(1, umaMovimentacao({ contaBancariaId: 1, tipo: 'transferencia', valor: 1000, contaDestinoId: 2 }))
    ).toBe(-1000);
    expect(
      efeitoMovimentacaoNaConta(2, umaMovimentacao({ contaBancariaId: 1, tipo: 'transferencia', valor: 1000, contaDestinoId: 2 }))
    ).toBe(1000);
  });

  it('movimentação de outra conta não mexe no saldo', () => {
    expect(efeitoMovimentacaoNaConta(3, umaMovimentacao({ contaBancariaId: 1, tipo: 'entrada', valor: 1000 }))).toBe(0);
  });
});

describe('calcularSaldoConta', () => {
  it('só com saldo inicial', () => {
    expect(calcularSaldoConta(contaPrincipal, [])).toBe(100000);
  });

  it('considera movimentações (inclusive as saídas que pagam conta fixa e fatura) e débito/pix', () => {
    expect(calcularSaldoConta(contaPrincipal, movimentacoesDoCenario, gastosDoCenario)).toBe(SALDO_ESPERADO_PRINCIPAL);
  });

  it('pagar uma fatura ou conta fixa com a conta tira do saldo dela', () => {
    const semPagamentos = calcularSaldoConta(contaPrincipal, movimentacoesManuaisDoCenario, gastosDoCenario);
    expect(semPagamentos - SALDO_ESPERADO_PRINCIPAL).toBe(7000 + 30000);
  });

  it('gasto no cartão não desconta da conta na compra', () => {
    const soCartao = gastosDoCenario.filter((g) => g.formaPagamento === 'cartao');
    expect(calcularSaldoConta(contaPrincipal, [], soCartao)).toBe(100000);
  });

  it('gasto em dinheiro não mexe em conta nenhuma', () => {
    const soDinheiro = gastosDoCenario.filter((g) => g.formaPagamento === 'dinheiro');
    expect(calcularSaldoConta(contaPrincipal, [], soDinheiro)).toBe(100000);
  });
});

describe('calcularSaldoTotal', () => {
  it('soma o saldo de todas as contas', () => {
    expect(calcularSaldoTotal([contaPrincipal, contaSecundaria], movimentacoesDoCenario, gastosDoCenario)).toBe(
      SALDO_ESPERADO_PRINCIPAL + SALDO_ESPERADO_SECUNDARIA
    );
  });

  it('transferência entre contas próprias não muda o total', () => {
    const transferencias = movimentacoesManuaisDoCenario.filter((m) => m.tipo === 'transferencia');
    expect(calcularSaldoTotal([contaPrincipal, contaSecundaria], transferencias)).toBe(100000);
  });
});
