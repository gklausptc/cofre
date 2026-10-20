import type { MovimentacaoReserva } from '@/domain/types/entities';

export interface MovimentacoesReservaRepository {
  /** Da mais recente para a mais antiga. */
  listarMovimentacoesReserva(): Promise<MovimentacaoReserva[]>;
  /** Aporte com data (divisão do salário); devolve o id para poder desfazer. */
  registrarAporte(valor: number, data: string): Promise<number>;
  excluirMovimentacaoReserva(id: number): Promise<void>;
}
