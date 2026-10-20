import { dataNoMes, mesDeCobrancaDaParcela, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import { ehPagamentoDeCompromisso } from '@/domain/usecases/naturezaMovimentacao';
import { mesSeguinte } from '@/core/utils/date';
import type { LancamentoDoPeriodo, StatusLancamento } from '@/domain/types/lancamento';
import type {
  AporteCofrinho,
  Cartao,
  Cofrinho,
  CompraParcelada,
  ContaFixa,
  Fatura,
  GastoRapido,
  Movimentacao,
  MovimentacaoReserva,
  Parcela,
} from '@/domain/types/entities';

/** Tudo o que o app guarda e que vira lançamento. Listas que faltarem contam como vazias. */
export type DadosFinanceiros = {
  movimentacoes?: Movimentacao[];
  gastos?: GastoRapido[];
  parcelas?: Parcela[];
  contasFixas?: ContaFixa[];
  comprasParceladas?: CompraParcelada[];
  cartoes?: Cartao[];
  faturas?: Fatura[];
  cofrinhos?: Cofrinho[];
  aportesCofrinho?: AporteCofrinho[];
  movimentacoesReserva?: MovimentacaoReserva[];
};

const mesDe = (dataIso: string) => dataIso.slice(0, 7);

/** Já aconteceu (até hoje) ou ainda vai acontecer. */
function statusPorData(dataIso: string, hojeIso: string): StatusLancamento {
  return dataIso > hojeIso ? 'previsto' : 'pago';
}

/** Compromisso: pago, ou vencido sem pagar (atrasado), ou ainda por vencer (previsto). */
function statusDeCompromisso(pago: boolean, vencimentoIso: string, hojeIso: string): StatusLancamento {
  if (pago) return 'pago';
  return vencimentoIso < hojeIso ? 'atrasado' : 'previsto';
}

/**
 * Lista única e tipada de tudo o que acontece entre `inicio` e `fim` (ISO, inclusivos, pela
 * `data` de cada lançamento): movimentações, gastos rápidos, parcelas de compras, ocorrências
 * de contas fixas, faturas de cartão (uma por cartão/mês de vencimento, somando o que é
 * cobrado nela), aportes em cofrinhos e movimentos da reserva. Em ordem de data.
 */
export function obterLancamentosDoPeriodo(
  inicio: string,
  fim: string,
  dados: DadosFinanceiros,
  hojeIso: string
): LancamentoDoPeriodo[] {
  const {
    movimentacoes = [],
    gastos = [],
    parcelas = [],
    contasFixas = [],
    comprasParceladas = [],
    cartoes = [],
    faturas = [],
    cofrinhos = [],
    aportesCofrinho = [],
    movimentacoesReserva = [],
  } = dados;

  const contasPorId = new Map(contasFixas.map((c) => [c.id, c]));
  const comprasPorId = new Map(comprasParceladas.map((c) => [c.id, c]));
  const cartoesPorId = new Map(cartoes.map((c) => [c.id, c]));
  const cofrinhosPorId = new Map(cofrinhos.map((c) => [c.id, c]));

  const todos: LancamentoDoPeriodo[] = [];
  const base = {
    contaBancariaId: null,
    cartaoId: null,
    categoriaId: null,
    membroId: null,
    noCartao: false,
  };

  // ---------- movimentações em conta ----------
  for (const mov of movimentacoes) {
    const comum = {
      ...base,
      id: `mov-${mov.id}`,
      tipo: 'movimentacao' as const,
      valor: mov.valor,
      data: mov.data,
      competencia: mesDe(mov.data),
      status: statusPorData(mov.data, hojeIso),
      contaBancariaId: mov.contaBancariaId,
      categoriaId: mov.categoriaId,
      membroId: mov.membroId,
      origem: mov.origem ?? 'manual',
      link: `/movimentacao/${mov.id}`,
    };
    if (mov.tipo === 'transferencia') {
      todos.push({ ...comum, natureza: 'transferencia', descricao: mov.descricao || 'Transferência' });
    } else if (mov.tipo === 'entrada') {
      todos.push({
        ...comum,
        natureza: 'receita',
        descricao: mov.descricao || 'Entrada',
        // entrada reservada para o mês seguinte pesa no orçamento dele
        competencia: mov.reservarProximoMes ? mesSeguinte(mesDe(mov.data)) : mesDe(mov.data),
        origem: mov.recorrenteOrigemId !== null ? 'recorrente' : comum.origem,
      });
    } else {
      todos.push({
        ...comum,
        natureza: ehPagamentoDeCompromisso(mov) ? 'pagamento' : 'despesa',
        descricao: mov.descricao || 'Saída',
      });
    }
  }

  // ---------- gastos rápidos ----------
  for (const gasto of gastos) {
    const noCartao = gasto.formaPagamento === 'cartao' && gasto.cartaoId !== null;
    todos.push({
      ...base,
      id: `gasto-${gasto.id}`,
      tipo: 'gasto',
      natureza: 'despesa',
      status: statusPorData(gasto.data, hojeIso),
      valor: gasto.valor,
      data: gasto.data,
      competencia: mesDeCobrancaDoGasto(gasto, cartoesPorId),
      descricao: gasto.descricao || 'Gasto rápido',
      origem: 'manual',
      noCartao,
      contaBancariaId: gasto.contaBancariaId,
      cartaoId: noCartao ? gasto.cartaoId : null,
      categoriaId: gasto.categoriaId,
      membroId: gasto.membroId,
      link: `/gasto-rapido/${gasto.id}`,
    });
  }

  // ---------- parcelas de compras e ocorrências de contas fixas ----------
  for (const parcela of parcelas) {
    const competencia = mesDeCobrancaDaParcela(parcela, contasPorId, comprasPorId, cartoesPorId);
    const paga = parcela.status === 'paga';

    if (parcela.compraParceladaId !== null) {
      const compra = comprasPorId.get(parcela.compraParceladaId);
      const cartao = compra ? cartoesPorId.get(compra.cartaoId) : undefined;
      if (!compra || !cartao) continue;
      const vencimento = dataNoMes(competencia, cartao.diaVencimento);
      todos.push({
        ...base,
        id: `parcela-${parcela.id}`,
        tipo: 'parcela',
        natureza: 'despesa',
        status: statusDeCompromisso(paga, vencimento, hojeIso),
        valor: parcela.valor,
        data: vencimento,
        competencia,
        descricao: `${compra.descricao} (${parcela.numero}/${compra.numParcelas})`,
        origem: 'compra_parcelada',
        noCartao: true,
        cartaoId: cartao.id,
        categoriaId: compra.categoriaId,
        membroId: compra.membroId,
        link: `/compra-parcelada/${compra.id}`,
      });
      continue;
    }

    if (parcela.contaFixaId !== null) {
      const conta = contasPorId.get(parcela.contaFixaId);
      if (!conta) continue;
      const noCartao = conta.formaPagamento === 'cartao' && conta.cartaoId !== null && cartoesPorId.has(conta.cartaoId);
      const dataDaConta = dataNoMes(parcela.mesReferencia, conta.diaVencimento);
      todos.push({
        ...base,
        id: `parcela-${parcela.id}`,
        tipo: 'conta_fixa',
        natureza: 'despesa',
        status: statusDeCompromisso(paga, dataDaConta, hojeIso),
        valor: parcela.valor,
        data: dataDaConta,
        competencia,
        descricao: conta.nome,
        origem: 'conta_fixa',
        noCartao,
        contaBancariaId: noCartao ? null : conta.contaBancariaId,
        cartaoId: noCartao ? conta.cartaoId : null,
        categoriaId: conta.categoriaId,
        membroId: conta.membroId,
        link: `/conta-fixa/${conta.id}`,
      });
    }
  }

  // ---------- faturas: uma por cartão e mês de vencimento ----------
  const totalPorFatura = new Map<string, { cartao: Cartao; competencia: string; total: number }>();
  for (const item of todos) {
    if (!item.noCartao || item.cartaoId === null) continue;
    const cartao = cartoesPorId.get(item.cartaoId);
    if (!cartao) continue;
    const chave = `${cartao.id}-${item.competencia}`;
    const atual = totalPorFatura.get(chave) ?? { cartao, competencia: item.competencia, total: 0 };
    atual.total += item.valor;
    totalPorFatura.set(chave, atual);
  }
  for (const [chave, { cartao, competencia, total }] of totalPorFatura) {
    const vencimento = dataNoMes(competencia, cartao.diaVencimento);
    const paga = faturas.some((f) => f.cartaoId === cartao.id && f.mesReferencia === competencia && f.status === 'paga');
    todos.push({
      ...base,
      id: `fatura-${chave}`,
      tipo: 'fatura',
      natureza: 'fatura',
      status: statusDeCompromisso(paga, vencimento, hojeIso),
      valor: total,
      data: vencimento,
      competencia,
      descricao: `Fatura ${cartao.nome}`,
      origem: 'fatura',
      cartaoId: cartao.id,
      link: `/cartao/${cartao.id}`,
    });
  }

  // ---------- dinheiro guardado ----------
  for (const aporte of aportesCofrinho) {
    const cofrinho = cofrinhosPorId.get(aporte.cofrinhoId);
    todos.push({
      ...base,
      id: `aporte-${aporte.id}`,
      tipo: 'aporte_cofrinho',
      natureza: 'guardado',
      status: statusPorData(aporte.data, hojeIso),
      valor: aporte.valor,
      data: aporte.data,
      competencia: mesDe(aporte.data),
      descricao: cofrinho ? `Cofrinho ${cofrinho.nome}` : 'Cofrinho',
      origem: 'cofrinho',
      link: `/cofrinho/${aporte.cofrinhoId}`,
    });
  }
  for (const mov of movimentacoesReserva) {
    todos.push({
      ...base,
      id: `reserva-${mov.id}`,
      tipo: 'reserva',
      natureza: mov.tipo === 'aporte' ? 'guardado' : 'resgate',
      status: statusPorData(mov.data, hojeIso),
      valor: mov.valor,
      data: mov.data,
      competencia: mesDe(mov.data),
      descricao: mov.tipo === 'aporte' ? 'Reserva de emergência' : `Retirada da reserva${mov.justificativa ? `: ${mov.justificativa}` : ''}`,
      origem: 'reserva',
      link: '/reserva-emergencia',
    });
  }

  return todos
    .filter((l) => l.data >= inicio && l.data <= fim)
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}
