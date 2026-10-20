import { mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import type { Cartao, CompraParcelada, Fatura, GastoRapido, Parcela } from '@/domain/types/entities';

/**
 * Limite livre = limite − parcelas pendentes das compras do cartão − compras à vista no
 * cartão cuja fatura ainda não foi paga. Pagar a fatura libera o limite: as parcelas dela
 * viram pagas e as compras à vista daquela fatura deixam de contar.
 */
export function calcularLimiteDisponivel(
  cartao: Pick<Cartao, 'id' | 'limite' | 'diaFechamento' | 'diaVencimento'>,
  comprasDoCartao: Pick<CompraParcelada, 'id' | 'cartaoId'>[],
  parcelas: Pick<Parcela, 'compraParceladaId' | 'valor' | 'status'>[],
  gastos: Pick<GastoRapido, 'cartaoId' | 'formaPagamento' | 'valor' | 'data'>[] = [],
  faturas: Pick<Fatura, 'cartaoId' | 'mesReferencia' | 'status'>[] = []
): number {
  const idsCompras = new Set(comprasDoCartao.filter((c) => c.cartaoId === cartao.id).map((c) => c.id));
  const usadoParcelas = parcelas
    .filter((p) => p.compraParceladaId !== null && idsCompras.has(p.compraParceladaId) && p.status === 'pendente')
    .reduce((soma, p) => soma + p.valor, 0);

  const mesesPagos = new Set(
    faturas.filter((f) => f.cartaoId === cartao.id && f.status === 'paga').map((f) => f.mesReferencia)
  );
  const cartoesPorId = new Map([[cartao.id, cartao]]);
  const usadoGastos = gastos
    .filter((g) => g.formaPagamento === 'cartao' && g.cartaoId === cartao.id)
    .filter((g) => !mesesPagos.has(mesDeCobrancaDoGasto(g, cartoesPorId)))
    .reduce((soma, g) => soma + g.valor, 0);

  return cartao.limite - usadoParcelas - usadoGastos;
}
