import { mesDeCobrancaDaParcela, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import type { Cartao, CompraParcelada, ContaFixa, GastoRapido, Parcela } from '@/domain/types/entities';

export type GastoFixoDoMes = {
  chave: string;
  nome: string;
  valor: number;
  paga: boolean;
};

export type ResumoGastosFixos = {
  total: number;
  totalPago: number;
  totalPendente: number;
  itens: GastoFixoDoMes[];
};

/**
 * Tudo que já está comprometido no mês: contas fixas (inclusive financiamentos
 * parcelados fora do cartão), parcelas de compras no cartão e gastos rápidos
 * feitos no cartão (que compõem a fatura). O valor da parcela é a fonte da
 * verdade sobre o que vence naquele mês.
 */
export function calcularGastosFixosDoMes(
  contasFixas: ContaFixa[],
  parcelas: Parcela[],
  mesReferencia: string,
  comprasParceladas: CompraParcelada[] = [],
  cartoes: Cartao[] = [],
  gastos: GastoRapido[] = []
): ResumoGastosFixos {
  const contasPorId = new Map(contasFixas.map((c) => [c.id, c]));
  const comprasPorId = new Map(comprasParceladas.map((c) => [c.id, c]));
  const cartoesPorId = new Map(cartoes.map((c) => [c.id, c]));

  const itens: GastoFixoDoMes[] = [];

  for (const p of parcelas) {
    if (mesDeCobrancaDaParcela(p, contasPorId, comprasPorId, cartoesPorId) !== mesReferencia) continue;

    if (p.contaFixaId !== null) {
      const conta = contasPorId.get(p.contaFixaId);
      if (!conta) continue;
      itens.push({ chave: `parcela-${p.id}`, nome: conta.nome, valor: p.valor, paga: p.status === 'paga' });
    } else if (p.compraParceladaId !== null) {
      const compra = comprasPorId.get(p.compraParceladaId);
      if (!compra) continue;
      const cartao = cartoesPorId.get(compra.cartaoId);
      const nome = `${compra.descricao} (${p.numero}/${compra.numParcelas})${cartao ? ` · ${cartao.nome}` : ''}`;
      itens.push({ chave: `parcela-${p.id}`, nome, valor: p.valor, paga: p.status === 'paga' });
    }
  }

  const gastosNoCartao = new Map<number, number>();
  for (const g of gastos) {
    if (g.formaPagamento !== 'cartao' || g.cartaoId === null) continue;
    if (mesDeCobrancaDoGasto(g, cartoesPorId) !== mesReferencia) continue;
    gastosNoCartao.set(g.cartaoId, (gastosNoCartao.get(g.cartaoId) ?? 0) + g.valor);
  }
  for (const [cartaoId, valor] of gastosNoCartao) {
    const cartao = cartoesPorId.get(cartaoId);
    itens.push({
      chave: `gastos-cartao-${cartaoId}`,
      nome: `Compras no ${cartao?.nome ?? 'cartão'}`,
      valor,
      paga: false,
    });
  }

  itens.sort((a, b) => a.nome.localeCompare(b.nome));

  const totalPago = itens.filter((i) => i.paga).reduce((soma, i) => soma + i.valor, 0);
  const totalPendente = itens.filter((i) => !i.paga).reduce((soma, i) => soma + i.valor, 0);

  return { total: totalPago + totalPendente, totalPago, totalPendente, itens };
}
