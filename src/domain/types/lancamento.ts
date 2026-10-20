/**
 * Lançamento da camada unificada: tudo o que entra, sai, vence ou é guardado, de qualquer
 * origem, no mesmo formato. É a fonte única para extrato, agenda, Início, previsão, gráficos
 * e notificações (ver `obterLancamentosDoPeriodo`).
 */

export type TipoLancamento =
  | 'movimentacao'
  | 'gasto'
  | 'parcela'
  | 'conta_fixa'
  | 'fatura'
  | 'aporte_cofrinho'
  | 'reserva';

/** Já aconteceu / ainda vai acontecer / venceu e não foi pago. */
export type StatusLancamento = 'pago' | 'previsto' | 'atrasado';

/**
 * Como o lançamento pesa no orçamento:
 * - receita / despesa: dinheiro que entrou ou foi consumido;
 * - fatura: o total a pagar de um cartão no mês (as compras dela vêm como despesa `noCartao`);
 * - pagamento: a saída que quitou uma fatura ou conta fixa (não é despesa de novo);
 * - transferencia: entre contas próprias (nem receita nem despesa);
 * - guardado / resgate: dinheiro posto ou tirado de cofrinho/reserva.
 */
export type NaturezaLancamento =
  | 'receita'
  | 'despesa'
  | 'fatura'
  | 'pagamento'
  | 'transferencia'
  | 'guardado'
  | 'resgate';

export type LancamentoDoPeriodo = {
  /** Único na lista: 'mov-12', 'gasto-3', 'parcela-9', 'fatura-1-2026-04'… */
  id: string;
  tipo: TipoLancamento;
  natureza: NaturezaLancamento;
  status: StatusLancamento;
  /** Em centavos, sempre positivo (a natureza diz se entra ou sai). */
  valor: number;
  /** ISO 'YYYY-MM-DD': quando aconteceu ou quando vence. */
  data: string;
  /** Mês ('YYYY-MM') em que pesa no orçamento: compra no cartão pesa no mês da fatura. */
  competencia: string;
  descricao: string;
  /** De onde veio: 'manual', 'recorrente', 'conta_fixa', 'fatura', 'compra_parcelada', 'cofrinho', 'reserva'. */
  origem: string;
  /** Cobrado numa fatura de cartão: quem pesa no orçamento é a fatura. */
  noCartao: boolean;
  contaBancariaId: number | null;
  cartaoId: number | null;
  categoriaId: number | null;
  membroId: number | null;
  /** Rota da tela da entidade (Expo Router). */
  link: string;
};
