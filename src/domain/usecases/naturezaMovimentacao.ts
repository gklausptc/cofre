import type { Movimentacao } from '@/domain/types/entities';

/**
 * Saída que paga um compromisso já contado em outro lugar: a fatura do cartão (cujas compras
 * e parcelas já são despesas) ou a ocorrência de uma conta fixa. Ela desconta do saldo da
 * conta, mas não pode entrar de novo como despesa nos relatórios — senão conta em dobro.
 */
export function ehPagamentoDeCompromisso(mov: Pick<Movimentacao, 'origem' | 'faturaId' | 'parcelaId'>): boolean {
  return mov.faturaId !== null || mov.parcelaId !== null || mov.origem === 'fatura' || mov.origem === 'conta_fixa';
}

/** Saída que é consumo de verdade (entra em "quanto gastei" e nos gastos por categoria). */
export function ehDespesa(mov: Pick<Movimentacao, 'tipo' | 'origem' | 'faturaId' | 'parcelaId'>): boolean {
  return mov.tipo === 'saida' && !ehPagamentoDeCompromisso(mov) && mov.origem !== 'interna';
}

/**
 * Dinheiro que só mudou de lugar entre contas suas: transferência, ou entrada/saída marcada
 * 'interna' (o outro lado é uma conta fora do app, como a poupança ou um PIX para o próprio
 * nome). Conta no saldo, mas não é receita nem despesa.
 */
export function ehMovimentoInterno(mov: Pick<Movimentacao, 'tipo' | 'origem'>): boolean {
  return mov.tipo === 'transferencia' || mov.origem === 'interna';
}

/** Entrada que é receita de verdade (salário, venda, reembolso…). */
export function ehReceita(mov: Pick<Movimentacao, 'tipo' | 'origem'>): boolean {
  return mov.tipo === 'entrada' && mov.origem !== 'interna';
}
