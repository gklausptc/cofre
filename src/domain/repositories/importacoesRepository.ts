import type { Fatura, GastoRapido, Importacao, NovaImportacao, NovaRegraCategorizacao, Parcela } from '@/domain/types/entities';
import type { PagamentoFatura } from './faturasRepository';
import type { DadosGastoRapido } from './gastosRapidosRepository';
import type { DadosMovimentacao } from './movimentacoesRepository';
import type { PerguntaNova } from '@/domain/types/perguntas';

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
  /** Faturas pagas sem saída de uma conta do app (pagas com saldo de outra carteira). */
  faturasPagas?: PagamentoFatura[];
  /** Lançamentos que já estavam no app e mudam (outro lado de transferência, receita prevista). */
  alteracoes: {
    movimentacaoId: number;
    motivo: 'transferencia' | 'receita_prevista';
    mudancas: Partial<DadosMovimentacao>;
    /** A linha do extrato que não foi gravada porque virou este lançamento (para reconhecer na reimportação). */
    linha?: { idExterno: string; data: string; valor: number; descricao: string } | null;
  }[];
  regrasNovas: DadosRegraCategorizacao[];
  /** Regras que categorizaram alguma linha (soma em vezesUsada). */
  regrasUsadas: number[];
  /** O que sobrou para você responder depois (tela Revisão). */
  perguntas: PerguntaNova[];
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
  /** Criadas ao responder perguntas desta importação (desfazer apaga). */
  comprasCriadas?: number[];
  contasFixasCriadas?: number[];
  /** Gastos de importações antigas que viraram parcelas de uma compra criada (desfazer devolve). */
  gastosApagados?: GastoRapido[];
  /**
   * Linhas do extrato que não viraram lançamento próprio (o outro lado da transferência já
   * estava no app): o id fica aqui para a reimportação reconhecer a linha como já importada.
   */
  linhasAbsorvidas?: { contaBancariaId: number; idExterno: string; data: string; valor: number; descricao: string }[];
};

export interface ImportacoesRepository {
  /** Da mais recente para a mais antiga. */
  listarImportacoes(): Promise<Importacao[]>;
  /**
   * Grava a importação, as linhas e tudo o que a conciliação manda fazer numa transação
   * única, guardando os efeitos para desfazer; devolve o id da importação.
   */
  registrarImportacao(registro: RegistroDeImportacao): Promise<number>;
  /**
   * Desfaz a importação inteira numa transação: apaga as linhas dela, volta contas fixas,
   * faturas e lançamentos alterados ao estado de antes, apaga compras e contas fixas criadas
   * pelas respostas e tira as perguntas dela da fila. As regras aprendidas continuam.
   */
  desfazerImportacao(id: number): Promise<void>;
}
