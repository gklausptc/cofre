import type { Importacao, NovaImportacao } from '@/domain/types/entities';
import type { DadosGastoRapido } from './gastosRapidosRepository';
import type { DadosMovimentacao } from './movimentacoesRepository';

export type DadosImportacao = Omit<NovaImportacao, 'id'>;

export type RegistroDeImportacao = {
  importacao: DadosImportacao;
  /** Linhas do extrato de conta (o repositório liga cada uma à importação). */
  movimentacoes: DadosMovimentacao[];
  /** Linhas da fatura de cartão. */
  gastos: DadosGastoRapido[];
};

export interface ImportacoesRepository {
  /** Da mais recente para a mais antiga. */
  listarImportacoes(): Promise<Importacao[]>;
  /** Grava a importação e todas as linhas dela numa transação única; devolve o id. */
  registrarImportacao(registro: RegistroDeImportacao): Promise<number>;
}
