import { formatarDecimal } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { efeitoMovimentacaoNaConta } from '@/domain/usecases/calcularSaldoConta';
import { dataNoMes, mesDeCobrancaDaParcela, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import type {
  Cartao,
  Categoria,
  CompraParcelada,
  ContaBancaria,
  ContaFixa,
  Fatura,
  GastoRapido,
  Movimentacao,
  Parcela,
} from '@/domain/types/entities';

const SEPARADOR = ';';
const QUEBRA = '\r\n';
const BOM = String.fromCharCode(0xfeff);

type CategoriasPorId = Map<number, Pick<Categoria, 'nome'>>;

/** Mês 'YYYY-MM' do extrato da conta, ou `null` para todo o histórico. */
export type PeriodoExtrato = string | null;

// ---------- formatação CSV (padrão brasileiro: ';' e decimal com vírgula, abre direto no Excel pt-BR) ----------

export function formatarCampoCSV(valor: string): string {
  const precisaAspas = valor.includes(SEPARADOR) || valor.includes('"') || valor.includes('\n') || valor.includes('\r');
  return precisaAspas ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** Centavos como "1234,56" (vírgula decimal, sem separador de milhar). */
export function formatarValorCSV(centavos: number): string {
  return formatarDecimal(centavos);
}

export function montarCSV(linhas: string[][]): string {
  const corpo = linhas.map((linha) => linha.map(formatarCampoCSV).join(SEPARADOR)).join(QUEBRA);
  return `${BOM}${corpo}${QUEBRA}`;
}

function nomeCategoria(categoriaId: number | null, categoriasPorId: CategoriasPorId): string {
  if (categoriaId === null) return '';
  return categoriasPorId.get(categoriaId)?.nome ?? '';
}

// ---------- conta bancária ----------

function rotuloTipoMovimentacao(contaId: number, mov: Pick<Movimentacao, 'tipo' | 'contaBancariaId' | 'origem'>): string {
  if (mov.tipo === 'entrada') return 'entrada';
  if (mov.tipo === 'saida') {
    if (mov.origem === 'fatura') return 'pagamento de fatura';
    if (mov.origem === 'conta_fixa') return 'conta fixa paga';
    return 'saída';
  }
  return mov.contaBancariaId === contaId ? 'transferência enviada' : 'transferência recebida';
}

/** O que, além das movimentações, mexe no saldo da conta (mesmas regras de `calcularSaldoConta`). */
export type OutrosLancamentosDaConta = {
  gastos?: GastoRapido[];
};

type LinhaExtratoConta = {
  data: string;
  /** Desempate dentro do mesmo dia: movimentações antes dos gastos rápidos. */
  ordem: number;
  id: number;
  tipo: string;
  descricao: string;
  categoria: string;
  efeito: number;
};

/**
 * Extrato de uma conta: colunas data;tipo;descricao;categoria;valor;saldo_apos.
 * Entram as movimentações (inclusive os pagamentos de conta fixa e de fatura, que são saídas
 * de verdade) e os gastos em débito/pix — assim o saldo final bate com `calcularSaldoConta`.
 * O saldo acumulado parte de `saldoInicial` e percorre TODO o histórico em ordem de data,
 * mas só as linhas do período entram no CSV.
 */
export function gerarExtratoContaCSV(
  conta: Pick<ContaBancaria, 'id' | 'saldoInicial'>,
  movimentacoes: Movimentacao[],
  categoriasPorId: CategoriasPorId,
  periodo: PeriodoExtrato,
  outros: OutrosLancamentosDaConta = {}
): string {
  const { gastos = [] } = outros;
  const itens: LinhaExtratoConta[] = [];

  for (const mov of movimentacoes) {
    if (mov.contaBancariaId !== conta.id && !(mov.tipo === 'transferencia' && mov.contaDestinoId === conta.id)) {
      continue;
    }
    itens.push({
      data: mov.data,
      ordem: 0,
      id: mov.id,
      tipo: rotuloTipoMovimentacao(conta.id, mov),
      descricao: mov.descricao ?? '',
      categoria: nomeCategoria(mov.categoriaId, categoriasPorId),
      efeito: efeitoMovimentacaoNaConta(conta.id, mov),
    });
  }

  for (const g of gastos) {
    if (g.contaBancariaId !== conta.id || (g.formaPagamento !== 'debito' && g.formaPagamento !== 'pix')) continue;
    itens.push({
      data: g.data,
      ordem: 1,
      id: g.id,
      tipo: 'saída',
      descricao: g.descricao || 'Gasto rápido',
      categoria: nomeCategoria(g.categoriaId, categoriasPorId),
      efeito: -g.valor,
    });
  }

  itens.sort((a, b) => a.data.localeCompare(b.data) || a.ordem - b.ordem || a.id - b.id);

  const linhas: string[][] = [['data', 'tipo', 'descricao', 'categoria', 'valor', 'saldo_apos']];
  let saldo = conta.saldoInicial;

  for (const item of itens) {
    saldo += item.efeito;
    if (periodo !== null && item.data.slice(0, 7) !== periodo) continue;
    linhas.push([
      formatarData(item.data),
      item.tipo,
      item.descricao,
      item.categoria,
      formatarValorCSV(item.efeito),
      formatarValorCSV(saldo),
    ]);
  }

  return montarCSV(linhas);
}

// ---------- cartão de crédito ----------

type ItemFatura = {
  data: string;
  descricao: string;
  parcela: string;
  categoria: string;
  valor: number;
  status: string;
};

/**
 * Itens cobrados na fatura de um cartão que vence em `mesFatura` ('YYYY-MM'):
 * gastos rápidos no cartão, parcelas de compras parceladas e parcelas de contas fixas
 * lançadas no cartão. Colunas data;descricao;parcela;categoria;valor;status, mais uma linha de total.
 */
export function gerarExtratoCartaoCSV(
  cartao: Cartao,
  gastos: GastoRapido[],
  parcelas: Parcela[],
  compras: CompraParcelada[],
  contasFixas: ContaFixa[],
  categoriasPorId: CategoriasPorId,
  mesFatura: string,
  faturas: Fatura[] = []
): string {
  const itens = itensDaFatura(cartao, gastos, parcelas, compras, contasFixas, categoriasPorId, mesFatura, faturas);
  const linhas: string[][] = [['data', 'descricao', 'parcela', 'categoria', 'valor', 'status']];
  for (const item of itens) {
    linhas.push([formatarData(item.data), item.descricao, item.parcela, item.categoria, formatarValorCSV(item.valor), item.status]);
  }
  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  linhas.push(['', 'TOTAL', '', '', formatarValorCSV(total), '']);
  return montarCSV(linhas);
}

/** Todas as faturas do cartão num arquivo só: a coluna "fatura" diz o mês de vencimento, com o total de cada uma. */
export function gerarExtratoCartaoTudoCSV(
  cartao: Cartao,
  gastos: GastoRapido[],
  parcelas: Parcela[],
  compras: CompraParcelada[],
  contasFixas: ContaFixa[],
  categoriasPorId: CategoriasPorId,
  faturas: Fatura[] = []
): string {
  const cartoesPorId = new Map<number, Cartao>([[cartao.id, cartao]]);
  const comprasPorId = new Map(compras.map((c) => [c.id, c]));
  const contasPorId = new Map(contasFixas.map((c) => [c.id, c]));
  const meses = new Set<string>();
  for (const g of gastos) if (g.formaPagamento === 'cartao' && g.cartaoId === cartao.id) meses.add(mesDeCobrancaDoGasto(g, cartoesPorId));
  for (const p of parcelas) {
    const compra = p.compraParceladaId !== null ? comprasPorId.get(p.compraParceladaId) : undefined;
    const conta = p.contaFixaId !== null ? contasPorId.get(p.contaFixaId) : undefined;
    if (compra?.cartaoId === cartao.id || (conta?.formaPagamento === 'cartao' && conta.cartaoId === cartao.id)) {
      meses.add(mesDeCobrancaDaParcela(p, contasPorId, comprasPorId, cartoesPorId));
    }
  }
  const linhas: string[][] = [['fatura', 'data', 'descricao', 'parcela', 'categoria', 'valor', 'status']];
  for (const mes of [...meses].sort()) {
    const itens = itensDaFatura(cartao, gastos, parcelas, compras, contasFixas, categoriasPorId, mes, faturas);
    for (const item of itens) {
      linhas.push([mes, formatarData(item.data), item.descricao, item.parcela, item.categoria, formatarValorCSV(item.valor), item.status]);
    }
    linhas.push([mes, '', `TOTAL DA FATURA ${mes}`, '', '', formatarValorCSV(itens.reduce((soma, item) => soma + item.valor, 0)), '']);
  }
  return montarCSV(linhas);
}

function itensDaFatura(
  cartao: Cartao,
  gastos: GastoRapido[],
  parcelas: Parcela[],
  compras: CompraParcelada[],
  contasFixas: ContaFixa[],
  categoriasPorId: CategoriasPorId,
  mesFatura: string,
  faturas: Fatura[]
): ItemFatura[] {
  const cartoesPorId = new Map<number, Cartao>([[cartao.id, cartao]]);
  const comprasPorId = new Map(compras.map((c) => [c.id, c]));
  const contasPorId = new Map(contasFixas.map((c) => [c.id, c]));
  const faturaPaga = faturas.some((f) => f.cartaoId === cartao.id && f.mesReferencia === mesFatura && f.status === 'paga');

  const itens: ItemFatura[] = [];

  for (const g of gastos) {
    if (g.formaPagamento !== 'cartao' || g.cartaoId !== cartao.id) continue;
    if (mesDeCobrancaDoGasto(g, cartoesPorId) !== mesFatura) continue;
    itens.push({
      data: g.data,
      descricao: g.descricao ?? 'Gasto no cartão',
      parcela: '',
      categoria: nomeCategoria(g.categoriaId, categoriasPorId),
      valor: g.valor,
      status: faturaPaga ? 'paga' : 'pendente',
    });
  }

  for (const p of parcelas) {
    if (p.compraParceladaId !== null) {
      const compra = comprasPorId.get(p.compraParceladaId);
      if (!compra || compra.cartaoId !== cartao.id) continue;
      if (mesDeCobrancaDaParcela(p, contasPorId, comprasPorId, cartoesPorId) !== mesFatura) continue;
      itens.push({
        data: compra.dataCompra,
        descricao: compra.descricao,
        parcela: `${p.numero}/${compra.numParcelas}`,
        categoria: nomeCategoria(compra.categoriaId, categoriasPorId),
        valor: p.valor,
        status: p.status ?? 'pendente',
      });
      continue;
    }

    if (p.contaFixaId !== null) {
      const conta = contasPorId.get(p.contaFixaId);
      if (!conta || conta.formaPagamento !== 'cartao' || conta.cartaoId !== cartao.id) continue;
      if (mesDeCobrancaDaParcela(p, contasPorId, comprasPorId, cartoesPorId) !== mesFatura) continue;
      itens.push({
        data: dataNoMes(p.mesReferencia, conta.diaVencimento),
        descricao: conta.nome,
        parcela: '',
        categoria: nomeCategoria(conta.categoriaId, categoriasPorId),
        valor: p.valor,
        status: p.status ?? 'pendente',
      });
    }
  }

  itens.sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao));
  return itens;
}
