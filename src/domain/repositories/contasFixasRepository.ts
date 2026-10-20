import type { ContaFixa, NovaContaFixa } from '@/domain/types/entities';

export type DadosContaFixa = Omit<NovaContaFixa, 'id' | 'ativo'>;

export interface ContasFixasRepository {
  /** Só as ativas. */
  listarContasFixas(): Promise<ContaFixa[]>;
  buscarContaFixa(id: number): Promise<ContaFixa | null>;
  criarContaFixa(dados: DadosContaFixa): Promise<ContaFixa>;
  atualizarContaFixa(id: number, dados: Partial<NovaContaFixa>): Promise<ContaFixa>;
  desativarContaFixa(id: number): Promise<void>;
}
