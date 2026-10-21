import type { ContaBancaria, NovaContaBancaria } from '@/domain/types/entities';

export type DadosContaBancaria = Omit<NovaContaBancaria, 'id' | 'ativo'>;

export interface ContasBancariasRepository {
  /** Só as ativas. */
  listarContasBancarias(): Promise<ContaBancaria[]>;
  /** Também as desativadas (exportar tudo). */
  listarTodasContasBancarias(): Promise<ContaBancaria[]>;
  buscarContaBancaria(id: number): Promise<ContaBancaria | null>;
  criarContaBancaria(dados: DadosContaBancaria): Promise<ContaBancaria>;
  atualizarContaBancaria(id: number, dados: Partial<NovaContaBancaria>): Promise<ContaBancaria>;
  desativarContaBancaria(id: number): Promise<void>;
}
