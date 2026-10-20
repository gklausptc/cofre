import type { Cofrinho, NovoCofrinho } from '@/domain/types/entities';

export type DadosCofrinho = Omit<NovoCofrinho, 'id' | 'status'>;

export interface CofrinhosRepository {
  listarCofrinhos(): Promise<Cofrinho[]>;
  buscarCofrinho(id: number): Promise<Cofrinho | null>;
  criarCofrinho(dados: DadosCofrinho): Promise<Cofrinho>;
  atualizarCofrinho(id: number, dados: Partial<DadosCofrinho>): Promise<Cofrinho>;
  marcarCofrinhoConcluido(id: number): Promise<void>;
  /** Remove o cofrinho e os aportes dele. */
  removerCofrinho(id: number): Promise<void>;
}
