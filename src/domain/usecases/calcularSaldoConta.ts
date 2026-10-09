import type { ContaBancaria, ContaFixa, Fatura, GastoRapido, Movimentacao, Parcela } from '@/domain/types/entities';

type ContaSaldo = Pick<ContaBancaria, 'id' | 'saldoInicial'>;

/**
 * saldo = saldoInicial + entradas - saídas + transferências recebidas - transferências enviadas
 *         - gastos rápidos pagos em débito/pix dessa conta
 *         - contas fixas já pagas (não-cartão) debitadas dessa conta
 *
 *         - faturas de cartão pagas com essa conta
 *
 * Gastos no cartão não descontam na compra: só saem da conta quando a fatura é paga.
 */
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

export function calcularSaldoConta(
  conta: ContaSaldo,
  movimentacoes: Movimentacao[],
  gastos: GastoRapido[] = [],
  parcelas: Parcela[] = [],
  contasFixas: ContaFixa[] = [],
  faturas: Fatura[] = []
): number {
  const saldoMovimentacoes = movimentacoes.reduce(
    (saldo, mov) => saldo + efeitoMovimentacaoNaConta(conta.id, mov),
    conta.saldoInicial
  );

  const gastosDebitados = gastos
    .filter(
      (g) => g.contaBancariaId === conta.id && (g.formaPagamento === 'debito' || g.formaPagamento === 'pix')
    )
    .reduce((soma, g) => soma + g.valor, 0);

  const contasFixasPorId = new Map(contasFixas.map((c) => [c.id, c]));
  const fixasPagas = parcelas
    .filter((p) => {
      if (p.status !== 'paga' || p.contaFixaId === null) return false;
      const fixa = contasFixasPorId.get(p.contaFixaId);
      return fixa !== undefined && fixa.formaPagamento !== 'cartao' && fixa.contaBancariaId === conta.id;
    })
    .reduce((soma, p) => soma + p.valor, 0);

  const faturasPagas = faturas
    .filter((f) => f.status === 'paga' && f.contaBancariaId === conta.id)
    .reduce((soma, f) => soma + (f.valorPago ?? 0), 0);

  return saldoMovimentacoes - gastosDebitados - fixasPagas - faturasPagas;
}

export function calcularSaldoTotal(
  contas: ContaSaldo[],
  movimentacoes: Movimentacao[],
  gastos: GastoRapido[] = [],
  parcelas: Parcela[] = [],
  contasFixas: ContaFixa[] = [],
  faturas: Fatura[] = []
): number {
  return contas.reduce(
    (total, conta) => total + calcularSaldoConta(conta, movimentacoes, gastos, parcelas, contasFixas, faturas),
    0
  );
}
