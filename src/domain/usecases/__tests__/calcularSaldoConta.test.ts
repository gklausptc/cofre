import { describe, expect, it } from '@jest/globals';
import { calcularSaldoConta, calcularSaldoTotal, efeitoMovimentacaoNaConta } from '@/domain/usecases/calcularSaldoConta';
import { umaMovimentacao } from '@/test/fabricas';
import {
  contaPrincipal,
  contaSecundaria,
  contasFixasDoCenario,
  faturasDoCenario,
  gastosDoCenario,
  movimentacoesDoCenario,
  parcelasDoCenario,
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

  it('considera movimentações, débito/pix, contas fixas pagas e faturas pagas pela conta', () => {
    expect(
      calcularSaldoConta(
        contaPrincipal,
        movimentacoesDoCenario,
        gastosDoCenario,
        parcelasDoCenario,
        contasFixasDoCenario,
        faturasDoCenario
      )
    ).toBe(SALDO_ESPERADO_PRINCIPAL);
  });

  it('gasto no cartão não desconta da conta na compra', () => {
    const soCartao = gastosDoCenario.filter((g) => g.formaPagamento === 'cartao');
    expect(calcularSaldoConta(contaPrincipal, [], soCartao)).toBe(100000);
  });

  it('conta fixa pendente não desconta', () => {
    const soPendentes = parcelasDoCenario.filter((p) => p.status === 'pendente');
    expect(calcularSaldoConta(contaPrincipal, [], [], soPendentes, contasFixasDoCenario)).toBe(100000);
  });
});

describe('calcularSaldoTotal', () => {
  it('soma o saldo de todas as contas', () => {
    expect(
      calcularSaldoTotal(
        [contaPrincipal, contaSecundaria],
        movimentacoesDoCenario,
        gastosDoCenario,
        parcelasDoCenario,
        contasFixasDoCenario,
        faturasDoCenario
      )
    ).toBe(SALDO_ESPERADO_PRINCIPAL + SALDO_ESPERADO_SECUNDARIA);
  });
});
