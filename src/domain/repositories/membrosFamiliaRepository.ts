import type { MembroFamilia } from '@/domain/types/entities';

export type DadosMembroFamilia = { nome: string; cor: string; icone: string };

export interface MembrosFamiliaRepository {
  /** Só os ativos. */
  listarMembrosFamilia(): Promise<MembroFamilia[]>;
  criarMembroFamilia(dados: DadosMembroFamilia): Promise<MembroFamilia>;
  desativarMembroFamilia(id: number): Promise<void>;
}
