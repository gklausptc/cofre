import type { ReservaEmergencia } from '@/domain/types/entities';
import type { ConfigRendimento } from '@/domain/usecases/rendimento';

export interface ReservaEmergenciaRepository {
  buscarReservaEmergencia(): Promise<ReservaEmergencia | null>;
  definirMetaReserva(valorMeta: number, mesesCoberturaDesejados: number | null): Promise<ReservaEmergencia>;
  /** Onde a reserva está aplicada (para o rendimento estimado). */
  definirRendimentoReserva(config: ConfigRendimento): Promise<void>;
  aportarReserva(valor: number): Promise<void>;
  /** Lança erro se a retirada for maior que o valor guardado (aportes − retiradas). */
  retirarReserva(valor: number, justificativa: string): Promise<void>;
  /** Reset completo: apaga a reserva e o histórico de aportes e retiradas. */
  removerReservaEmergencia(): Promise<void>;
}
