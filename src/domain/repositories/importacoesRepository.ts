import type { Fatura, Importacao, NovaImportacao, NovaRegraCategorizacao, Parcela } from '@/domain/types/entities';
import type { PagamentoFatura } from './faturasRepository';
import type { DadosGastoRapido } from './gastosRapidosRepository';
import type { DadosMovimentacao } from './movimentacoesRepository';

export type DadosImportacao = Omit<NovaImportacao, 'id' | 'efeitos'>;
export type DadosRegraCategorizacao = Omit<NovaRegraCategorizacao, 'id'>;

export type RegistroDeImportacao = {
  importacao: DadosImportacao;
  /** Linhas do extrato de conta (o repositório liga cada uma à importação). */
  movimentacoes: DadosMovimentacao[];
  /** Linhas da fatura de cartão. */
  gastos: DadosGastoRapido[];
  /** Ocorrências de conta fixa pagas pelo extrato (o valor é o do extrato). */
  pagamentosDeContaFixa: { parcelaId: number; dataPagamento: string; valor: number }[];
  /** Faturas pagas pelo extrato: baixa nas parcelas, fatura paga e a saída ligada a ela. */
  pagamentosDeFatura: { pagamento: PagamentoFatura; parcelaIds: number[]; saida: DadosMovimentacao }[];
  /** Lançamentos que já estavam no app e mudam (outro lado de transferência, receita prevista). */
  alteracoes: { movimentacaoId: number; motivo: 'transferencia' | 'receita_prevista'; mudancas: Partial<DadosMovimentacao> }[];
  regrasNovas: DadosRegraCategorizacao[];
  /** Regras que categorizaram alguma linha (soma em vezesUsada). */
  regrasUsadas: number[];
};

/**
 * O que a importação mudou fora das próprias linhas, com o estado de antes, para desfazer.
 * Fica em JSON na coluna `importacoes.efeitos`.
 */
export type EfeitosDaImportacao = {
  parcelas: Pick<Parcela, 'id' | 'status' | 'dataPagamento' | 'valor' | 'valorOriginal' | 'justificativaAlteracao'>[];
  /** `antes` null: a fatura foi criada pela importação. */
  faturas: { id: number; antes: Pick<Fatura, 'status' | 'contaBancariaId' | 'valorPago' | 'dataPagamento'> | null }[];
  movimentacoes: { id: number; antes: Partial<DadosMovimentacao> }[];
  regrasCriadas: number[];
};

export interface ImportacoesRepository {
  /** Da mais recente para a mais antiga. */
  listarImportacoes(): Promise<Importacao[]>;
  /**
   * Grava a importação, as linhas e tudo o que a conciliação manda fazer numa transação
   * única, guardando os efeitos para desfazer; devolve o id da importação.
   */
  registrarImportacao(registro: RegistroDeImportacao): Promise<number>;
}
