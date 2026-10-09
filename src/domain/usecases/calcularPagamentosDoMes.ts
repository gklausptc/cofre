import { dataNoMes, mesDeCobrancaDaParcela, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import type { Cartao, CompraParcelada, ContaFixa, Fatura, GastoRapido, Parcela } from '@/domain/types/entities';

export type ItemPagamento = {
  chave: string;
  tipo: 'parcela' | 'gasto-cartao';
  origemId: number;
  nome: string;
  detalhe: string;
  /** Data de vencimento (contas fixas fora do cartão); null quando o vencimento é o da fatura. */
  vencimento: string | null;
  valor: number;
  valorOriginal: number | null;
  justificativa: string | null;
  paga: boolean;
};

export type GrupoPagamento = {
  chave: string;
  titulo: string;
  /** Preenchido só nos grupos de fatura de cartão. */
  cartao: Cartao | null;
  vencimento: string | null;
  itens: ItemPagamento[];
  total: number;
  pendente: number;
  faturaPaga: boolean;
};

export type PagamentosDoMes = {
  grupos: GrupoPagamento[];
  total: number;
  totalPendente: number;
  totalPago: number;
};

/**
 * Tudo que há para pagar no mês, de forma simples: um grupo com as contas fixas
 * (débito/pix/boleto) e um grupo de fatura por cartão, que reúne parcelas de
 * compras, contas fixas lançadas no cartão e gastos feitos nele. Cada compra entra
 * na fatura certa pelo dia de fechamento, e o mês é o do vencimento. Quando a fatura
 * do cartão/mês foi paga, todos os itens do grupo contam como pagos.
 */
export function calcularPagamentosDoMes(
  contasFixas: ContaFixa[],
  parcelas: Parcela[],
  comprasParceladas: CompraParcelada[],
  cartoes: Cartao[],
  gastos: GastoRapido[],
  faturas: Fatura[],
  mesReferencia: string
): PagamentosDoMes {
  const contasPorId = new Map(contasFixas.map((c) => [c.id, c]));
  const comprasPorId = new Map(comprasParceladas.map((c) => [c.id, c]));
  const cartoesPorId = new Map(cartoes.map((c) => [c.id, c]));

  const itensFixas: ItemPagamento[] = [];
  const itensPorCartao = new Map<number, ItemPagamento[]>();
  const adicionarNoCartao = (cartaoId: number, item: ItemPagamento) => {
    const lista = itensPorCartao.get(cartaoId) ?? [];
    lista.push(item);
    itensPorCartao.set(cartaoId, lista);
  };

  for (const p of parcelas) {
    if (mesDeCobrancaDaParcela(p, contasPorId, comprasPorId, cartoesPorId) !== mesReferencia) continue;
    const base = {
      tipo: 'parcela' as const,
      origemId: p.id,
      chave: `parcela-${p.id}`,
      valor: p.valor,
      valorOriginal: p.valorOriginal,
      justificativa: p.justificativaAlteracao,
      paga: p.status === 'paga',
    };

    if (p.contaFixaId !== null) {
      const conta = contasPorId.get(p.contaFixaId);
      if (!conta) continue;
      if (conta.formaPagamento === 'cartao' && conta.cartaoId !== null) {
        adicionarNoCartao(conta.cartaoId, {
          ...base,
          nome: conta.nome,
          detalhe: 'Conta fixa no cartão',
          vencimento: null,
        });
      } else {
        itensFixas.push({
          ...base,
          nome: conta.nome,
          detalhe: `Dia ${conta.diaVencimento}`,
          vencimento: dataNoMes(p.mesReferencia, conta.diaVencimento),
        });
      }
    } else if (p.compraParceladaId !== null) {
      const compra = comprasPorId.get(p.compraParceladaId);
      if (!compra) continue;
      adicionarNoCartao(compra.cartaoId, {
        ...base,
        nome: compra.descricao,
        detalhe: `Parcela ${p.numero} de ${compra.numParcelas}`,
        vencimento: null,
      });
    }
  }

  for (const g of gastos) {
    if (g.formaPagamento !== 'cartao' || g.cartaoId === null) continue;
    if (mesDeCobrancaDoGasto(g, cartoesPorId) !== mesReferencia) continue;
    adicionarNoCartao(g.cartaoId, {
      chave: `gasto-${g.id}`,
      tipo: 'gasto-cartao',
      origemId: g.id,
      nome: g.descricao || 'Compra no cartão',
      detalhe: 'Compra à vista no cartão',
      vencimento: null,
      valor: g.valor,
      valorOriginal: g.valorOriginal,
      justificativa: g.justificativaAlteracao,
      paga: false,
    });
  }

  const montarGrupo = (
    chave: string,
    titulo: string,
    cartao: Cartao | null,
    itens: ItemPagamento[],
    faturaPaga: boolean
  ): GrupoPagamento => {
    const itensFinais = faturaPaga ? itens.map((i) => ({ ...i, paga: true })) : itens;
    return {
      chave,
      titulo,
      cartao,
      vencimento: cartao ? dataNoMes(mesReferencia, cartao.diaVencimento) : null,
      itens: itensFinais,
      total: itensFinais.reduce((soma, i) => soma + i.valor, 0),
      pendente: itensFinais.filter((i) => !i.paga).reduce((soma, i) => soma + i.valor, 0),
      faturaPaga,
    };
  };

  const grupos: GrupoPagamento[] = [];

  if (itensFixas.length > 0) {
    itensFixas.sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? ''));
    grupos.push(montarGrupo('fixas', 'Contas fixas', null, itensFixas, false));
  }

  for (const cartao of cartoes) {
    const itens = itensPorCartao.get(cartao.id);
    if (!itens || itens.length === 0) continue;
    const faturaPaga = faturas.some(
      (f) => f.cartaoId === cartao.id && f.mesReferencia === mesReferencia && f.status === 'paga'
    );
    itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    grupos.push(montarGrupo(`fatura-${cartao.id}`, `Fatura ${cartao.nome}`, cartao, itens, faturaPaga));
  }

  const total = grupos.reduce((soma, g) => soma + g.total, 0);
  const totalPendente = grupos.reduce((soma, g) => soma + g.pendente, 0);

  return { grupos, total, totalPendente, totalPago: total - totalPendente };
}
