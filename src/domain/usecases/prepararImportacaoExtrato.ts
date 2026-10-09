import type { NovaMovimentacao, NovoGastoRapido } from '@/domain/types/entities';

export type TransacaoExtrato = {
  /** ISO 'YYYY-MM-DD' */
  data: string;
  descricao: string;
  /** Com sinal: em conta, negativo = saída; em fatura de cartão, negativo = pagamento/estorno. */
  valor: number;
};

export type DestinoImportacao =
  | { tipo: 'conta'; contaBancariaId: number }
  | { tipo: 'cartao'; cartaoId: number };

export type ImportacaoPreparada = {
  movimentacoes: Omit<NovaMovimentacao, 'id'>[];
  gastos: Omit<NovoGastoRapido, 'id'>[];
  /** Linhas deixadas de fora (pagamentos/estornos em fatura de cartão). */
  ignoradas: number;
};

/**
 * Em fatura de cartão, valor positivo é compra; negativo é pagamento da fatura ou estorno,
 * que não vira gasto (o pagamento da fatura já é registrado pela própria tela de faturas).
 */
export function ehPagamentoOuEstorno(transacao: Pick<TransacaoExtrato, 'valor'>, destino: DestinoImportacao): boolean {
  return destino.tipo === 'cartao' && transacao.valor < 0;
}

/**
 * Converte as linhas de um extrato nos registros a gravar:
 * - conta bancária: cada linha vira uma movimentação (negativo = saída, positivo = entrada);
 * - cartão de crédito: cada linha positiva vira um gasto rápido no cartão; negativas são ignoradas.
 */
export function prepararImportacaoExtrato(
  transacoes: TransacaoExtrato[],
  destino: DestinoImportacao
): ImportacaoPreparada {
  if (destino.tipo === 'conta') {
    return {
      movimentacoes: transacoes.map((t) => ({
        contaBancariaId: destino.contaBancariaId,
        tipo: t.valor < 0 ? 'saida' : 'entrada',
        valor: Math.abs(t.valor),
        data: t.data,
        descricao: t.descricao,
        categoriaId: null,
        contaDestinoId: null,
        origem: 'manual',
        membroId: null,
      })),
      gastos: [],
      ignoradas: 0,
    };
  }

  const validas = transacoes.filter((t) => !ehPagamentoOuEstorno(t, destino));
  return {
    movimentacoes: [],
    gastos: validas.map((t) => ({
      valor: Math.abs(t.valor),
      categoriaId: null,
      descricao: t.descricao,
      data: t.data,
      formaPagamento: 'cartao',
      contaBancariaId: null,
      cartaoId: destino.cartaoId,
      membroId: null,
    })),
    ignoradas: transacoes.length - validas.length,
  };
}
