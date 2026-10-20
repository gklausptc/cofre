import type { MovimentacaoReserva, ReservaEmergencia } from '@/domain/types/entities';

/** Reserva com o valor guardado calculado pelo histórico (não é coluna do banco). */
export type ReservaComSaldo = ReservaEmergencia & { valorAtual: number };

type Movimento = Pick<MovimentacaoReserva, 'tipo' | 'valor'>;

/** Valor guardado na reserva = aportes − retiradas. */
export function calcularValorReserva(historico: Movimento[]): number {
  return historico.reduce((saldo, mov) => saldo + (mov.tipo === 'aporte' ? mov.valor : -mov.valor), 0);
}

export function comSaldo(reserva: ReservaEmergencia | null, historico: Movimento[]): ReservaComSaldo | null {
  return reserva ? { ...reserva, valorAtual: calcularValorReserva(historico) } : null;
}

/**
 * Lançamento que faz o histórico bater com um valor guardado de antes (quando a reserva tinha
 * a coluna valor_atual e o histórico podia divergir dela). null se já bate.
 */
export function ajusteDoSaldoReserva(
  valorGravado: number,
  historico: Movimento[]
): { tipo: MovimentacaoReserva['tipo']; valor: number } | null {
  const diferenca = valorGravado - calcularValorReserva(historico);
  if (diferenca === 0) return null;
  return { tipo: diferenca > 0 ? 'aporte' : 'retirada', valor: Math.abs(diferenca) };
}

export const JUSTIFICATIVA_AJUSTE_RESERVA = 'Ajuste para manter o saldo da reserva (Cofre 2.0)';
