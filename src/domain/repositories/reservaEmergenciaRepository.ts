import type { ReservaEmergencia } from '@/domain/types/entities';

export interface ReservaEmergenciaRepository {
  buscarReservaEmergencia(): Promise<ReservaEmergencia | null>;
  definirMetaReserva(valorMeta: number, mesesCoberturaDesejados: number | null): Promise<ReservaEmergencia>;
  aportarReserva(valor: number): Promise<void>;
  retirarReserva(valor: number, justificativa: string): Promise<void>;
  /** Reset completo: apaga a reserva e o histórico de aportes e retiradas. */
  removerReservaEmergencia(): Promise<void>;
}
