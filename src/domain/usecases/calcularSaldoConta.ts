import type { ContaBancaria, GastoRapido, Movimentacao } from '@/domain/types/entities';

type ContaSaldo = Pick<ContaBancaria, 'id' | 'saldoInicial'>;

/**
 * Quanto uma movimentação soma (+) ou tira (-) do saldo de uma conta:
 * entrada soma, saída e transferência enviada tiram, transferência recebida soma.
 */
export function efeitoMovimentacaoNaConta(
  contaId: number,
  mov: Pick<Movimentacao, 'contaBancariaId' | 'tipo' | 'valor' | 'contaDestinoId'>
): number {
  if (mov.contaBancariaId === contaId) {
    if (mov.tipo === 'entrada') return mov.valor;
    if (mov.tipo === 'saida' || mov.tipo === 'transferencia') return -mov.valor;
  }
  if (mov.tipo === 'transferencia' && mov.contaDestinoId === contaId) {
    return mov.valor;
  }
  return 0;
}

/**
 * saldo = saldoInicial + entradas − saídas + transferências recebidas − transferências enviadas
 *         − gastos rápidos pagos em débito/pix dessa conta
 *
 * Pagar uma conta fixa ou uma fatura com a conta gera uma saída de verdade (origem
 * 'conta_fixa'/'fatura'), então ela já entra aqui como movimentação. Gastos no cartão não
 * descontam na compra: só saem da conta quando a fatura é paga.
 */
export function calcularSaldoConta(conta: ContaSaldo, movimentacoes: Movimentacao[], gastos: GastoRapido[] = []): number {
  const saldoMovimentacoes = movimentacoes.reduce(
    (saldo, mov) => saldo + efeitoMovimentacaoNaConta(conta.id, mov),
    conta.saldoInicial
  );

  const gastosDebitados = gastos
    .filter(
      (g) => g.contaBancariaId === conta.id && (g.formaPagamento === 'debito' || g.formaPagamento === 'pix')
    )
    .reduce((soma, g) => soma + g.valor, 0);

  return saldoMovimentacoes - gastosDebitados;
}

export function calcularSaldoTotal(contas: ContaSaldo[], movimentacoes: Movimentacao[], gastos: GastoRapido[] = []): number {
  return contas.reduce((total, conta) => total + calcularSaldoConta(conta, movimentacoes, gastos), 0);
}
