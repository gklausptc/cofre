import type { Cartao, CompraParcelada, GastoRapido, Parcela } from '@/domain/types/entities';

export function calcularLimiteDisponivel(
  cartao: Pick<Cartao, 'id' | 'limite'>,
  comprasDoCartao: Pick<CompraParcelada, 'id' | 'cartaoId'>[],
  parcelas: Pick<Parcela, 'compraParceladaId' | 'valor' | 'status'>[],
  gastos: Pick<GastoRapido, 'cartaoId' | 'formaPagamento' | 'valor'>[] = []
): number {
  const idsCompras = new Set(comprasDoCartao.filter((c) => c.cartaoId === cartao.id).map((c) => c.id));
  const usadoParcelas = parcelas
    .filter((p) => p.compraParceladaId !== null && idsCompras.has(p.compraParceladaId) && p.status === 'pendente')
    .reduce((soma, p) => soma + p.valor, 0);
  const usadoGastos = gastos
    .filter((g) => g.formaPagamento === 'cartao' && g.cartaoId === cartao.id)
    .reduce((soma, g) => soma + g.valor, 0);
  return cartao.limite - usadoParcelas - usadoGastos;
}
