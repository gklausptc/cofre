import type { GastoRapido, NovoGastoRapido } from '@/domain/types/entities';

export type DadosGastoRapido = Omit<NovoGastoRapido, 'id'>;

export interface GastosRapidosRepository {
  listarGastosRapidos(): Promise<GastoRapido[]>;
  buscarGastoRapido(id: number): Promise<GastoRapido | null>;
  criarGastoRapido(dados: DadosGastoRapido): Promise<GastoRapido>;
  atualizarGastoRapido(id: number, dados: Partial<DadosGastoRapido>): Promise<GastoRapido>;
  excluirGastoRapido(id: number): Promise<void>;
  /** Altera o valor, guardando o valor de antes e o motivo. */
  ajustarValorGasto(id: number, novoValor: number, justificativa: string): Promise<void>;
}
