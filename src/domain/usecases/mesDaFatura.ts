import { addMonths, differenceInCalendarDays, format, getDaysInMonth, parseISO, subMonths } from 'date-fns';
import type { Cartao, CompraParcelada, ContaFixa, GastoRapido, Parcela } from '@/domain/types/entities';

type DiasDoCartao = Pick<Cartao, 'diaFechamento' | 'diaVencimento'>;

/** Data 'YYYY-MM-DD' do dia `dia` no mês, limitando ao último dia do mês (ex.: dia 31 em junho vira 30). */
export function dataNoMes(mesReferencia: string, dia: number): string {
  const ultimoDia = getDaysInMonth(parseISO(`${mesReferencia}-01`));
  return `${mesReferencia}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

/** Mês em que fecha a fatura que recebe uma compra: passou do fechamento, cai na fatura seguinte. */
export function mesFechamentoDaCompra(dataIso: string, diaFechamento: number): string {
  const data = parseISO(dataIso);
  return format(data.getDate() > diaFechamento ? addMonths(data, 1) : data, 'yyyy-MM');
}

/** Mês em que vence a fatura que fecha em `mesFechamento` (vencimento antes do fechamento = mês seguinte). */
export function mesVencimentoDaFatura(mesFechamento: string, cartao: DiasDoCartao): string {
  return cartao.diaVencimento >= cartao.diaFechamento
    ? mesFechamento
    : format(addMonths(parseISO(`${mesFechamento}-01`), 1), 'yyyy-MM');
}

/** Data de fechamento da fatura que vence em `mesVencimento`. */
export function dataFechamentoDaFatura(mesVencimento: string, cartao: DiasDoCartao): string {
  const mesFechamento =
    cartao.diaVencimento >= cartao.diaFechamento
      ? mesVencimento
      : format(subMonths(parseISO(`${mesVencimento}-01`), 1), 'yyyy-MM');
  return dataNoMes(mesFechamento, cartao.diaFechamento);
}

/** Mês em que você paga (vencimento da fatura) uma compra à vista feita no cartão. */
export function mesDeCobrancaDoGasto(
  gasto: Pick<GastoRapido, 'data' | 'formaPagamento' | 'cartaoId'>,
  cartoesPorId: Map<number, DiasDoCartao>
): string {
  const cartao = gasto.formaPagamento === 'cartao' && gasto.cartaoId !== null ? cartoesPorId.get(gasto.cartaoId) : undefined;
  if (!cartao) return gasto.data.slice(0, 7);
  return mesVencimentoDaFatura(mesFechamentoDaCompra(gasto.data, cartao.diaFechamento), cartao);
}

/**
 * Mês em que você paga uma parcela: para compras parceladas e contas fixas lançadas no
 * cartão é o vencimento da fatura onde ela cai; para as demais, o próprio mês da parcela.
 */
export function mesDeCobrancaDaParcela(
  parcela: Pick<Parcela, 'mesReferencia' | 'compraParceladaId' | 'contaFixaId'>,
  contasPorId: Map<number, Pick<ContaFixa, 'formaPagamento' | 'cartaoId' | 'diaVencimento'>>,
  comprasPorId: Map<number, Pick<CompraParcelada, 'cartaoId'>>,
  cartoesPorId: Map<number, DiasDoCartao>
): string {
  if (parcela.compraParceladaId !== null) {
    const cartaoId = comprasPorId.get(parcela.compraParceladaId)?.cartaoId;
    const cartao = cartaoId !== undefined ? cartoesPorId.get(cartaoId) : undefined;
    // mesReferencia da parcela de compra já é o mês de fechamento da fatura
    return cartao ? mesVencimentoDaFatura(parcela.mesReferencia, cartao) : parcela.mesReferencia;
  }
  if (parcela.contaFixaId !== null) {
    const conta = contasPorId.get(parcela.contaFixaId);
    const cartao = conta?.formaPagamento === 'cartao' && conta.cartaoId !== null ? cartoesPorId.get(conta.cartaoId) : undefined;
    if (conta && cartao) {
      const dataDaCobranca = dataNoMes(parcela.mesReferencia, conta.diaVencimento);
      return mesVencimentoDaFatura(mesFechamentoDaCompra(dataDaCobranca, cartao.diaFechamento), cartao);
    }
  }
  return parcela.mesReferencia;
}

export type SituacaoVencimento = { texto: string; atrasado: boolean };

/** Texto de prazo ("Vence em 3 dias", "Atrasada há 2 dias") — atrasado só se ainda não foi pago. */
export function situacaoVencimento(vencimentoIso: string, paga: boolean, hojeIso: string): SituacaoVencimento {
  if (paga) return { texto: 'Pago', atrasado: false };
  const dias = differenceInCalendarDays(parseISO(vencimentoIso), parseISO(hojeIso));
  if (dias < 0) {
    const atraso = -dias;
    return { texto: `Atrasado há ${atraso} dia${atraso === 1 ? '' : 's'}`, atrasado: true };
  }
  if (dias === 0) return { texto: 'Vence hoje', atrasado: false };
  if (dias === 1) return { texto: 'Vence amanhã', atrasado: false };
  return { texto: `Vence em ${dias} dias`, atrasado: false };
}

/**
 * Mês de fechamento da fatura da 1ª parcela: vem da data da compra + dia de fechamento,
 * mais um deslocamento manual em meses (para acertar quando o banco fecha diferente).
 */
export function mesPrimeiraFatura(
  dataCompraIso: string | null,
  cartao: Pick<Cartao, 'diaFechamento'>,
  deslocamentoMeses: number
): string | null {
  if (dataCompraIso === null) return null;
  const base = mesFechamentoDaCompra(dataCompraIso, cartao.diaFechamento);
  return format(addMonths(parseISO(`${base}-01`), deslocamentoMeses), 'yyyy-MM');
}
