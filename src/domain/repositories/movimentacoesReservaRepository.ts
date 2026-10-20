import type { MovimentacaoReserva } from '@/domain/types/entities';

export interface MovimentacoesReservaRepository {
  /** Da mais recente para a mais antiga. */
  listarMovimentacoesReserva(): Promise<MovimentacaoReserva[]>;
}
