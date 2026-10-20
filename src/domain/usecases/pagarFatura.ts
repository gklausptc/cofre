import { dataFechamentoDaFatura, dataNoMes } from '@/domain/usecases/mesDaFatura';
import type { PagamentoFatura } from '@/domain/repositories/faturasRepository';
import type { DadosMovimentacao } from '@/domain/repositories/movimentacoesRepository';
import type { Cartao, ContaFixa, Parcela } from '@/domain/types/entities';

export type PedidoPagamentoFatura = {
  cartao: Pick<Cartao, 'id' | 'nome' | 'diaFechamento' | 'diaVencimento'>;
  /** Mês de vencimento da fatura ('YYYY-MM'). */
  mesReferencia: string;
  /** Em centavos. */
  valorPago: number;
  parcelaIds: number[];
  /** Conta de onde saiu o dinheiro; null = "não descontar de conta". */
  contaBancariaId: number | null;
};

export type PlanoPagamentoFatura = {
  parcelasAPagar: number[];
  dataPagamento: string;
  registro: PagamentoFatura;
  /** Saída na conta escolhida (a ligação com a fatura é feita ao gravar); null sem conta. */
  saida: DadosMovimentacao | null;
};

function saidaDePagamento(
  dados: Pick<DadosMovimentacao, 'contaBancariaId' | 'valor' | 'data' | 'descricao' | 'categoriaId' | 'membroId' | 'origem'>
): DadosMovimentacao {
  return {
    ...dados,
    tipo: 'saida',
    contaDestinoId: null,
    reservarProximoMes: false,
    recorrente: false,
    recorrenteOrigemId: null,
    faturaId: null,
    parcelaId: null,
  };
}

/**
 * O que gravar ao pagar uma fatura: dar baixa nas parcelas dela, registrar a fatura do
 * cartão/mês como paga e, se o dinheiro saiu de uma conta, lançar a saída nessa conta.
 */
export function planejarPagamentoFatura(pedido: PedidoPagamentoFatura, hojeIso: string): PlanoPagamentoFatura {
  const { cartao, mesReferencia, contaBancariaId, valorPago } = pedido;
  return {
    parcelasAPagar: [...new Set(pedido.parcelaIds)],
    dataPagamento: hojeIso,
    registro: {
      cartaoId: cartao.id,
      mesReferencia,
      dataFechamento: dataFechamentoDaFatura(mesReferencia, cartao),
      dataVencimento: dataNoMes(mesReferencia, cartao.diaVencimento),
      contaBancariaId,
      valorPago,
      dataPagamento: hojeIso,
    },
    saida:
      contaBancariaId !== null && valorPago > 0
        ? saidaDePagamento({
            contaBancariaId,
            valor: valorPago,
            data: hojeIso,
            descricao: `Fatura ${cartao.nome}`,
            categoriaId: null,
            membroId: null,
            origem: 'fatura',
          })
        : null,
  };
}

export type PlanoPagamentoContaFixa = {
  parcelaId: number;
  dataPagamento: string;
  /** Saída na conta da conta fixa; null quando é no cartão (entra na fatura) ou não tem conta. */
  saida: DadosMovimentacao | null;
};

/**
 * Marcar como paga uma ocorrência de conta fixa: dá baixa nela e, se a conta é paga por
 * débito/pix/boleto de uma conta bancária, lança a saída nessa conta. Parcelas de compra no
 * cartão (e contas fixas no cartão) não geram saída: são pagas junto com a fatura.
 */
export function planejarPagamentoContaFixa(
  parcela: Pick<Parcela, 'id' | 'valor' | 'contaFixaId'>,
  contaFixa: Pick<ContaFixa, 'id' | 'nome' | 'formaPagamento' | 'contaBancariaId' | 'categoriaId' | 'membroId'> | null,
  hojeIso: string
): PlanoPagamentoContaFixa {
  const geraSaida =
    contaFixa !== null &&
    parcela.contaFixaId === contaFixa.id &&
    contaFixa.formaPagamento !== 'cartao' &&
    contaFixa.contaBancariaId !== null;

  return {
    parcelaId: parcela.id,
    dataPagamento: hojeIso,
    saida:
      geraSaida && contaFixa.contaBancariaId !== null
        ? saidaDePagamento({
            contaBancariaId: contaFixa.contaBancariaId,
            valor: parcela.valor,
            data: hojeIso,
            descricao: contaFixa.nome,
            categoriaId: contaFixa.categoriaId,
            membroId: contaFixa.membroId,
            origem: 'conta_fixa',
          })
        : null,
  };
}
