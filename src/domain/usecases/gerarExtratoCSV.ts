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

export function formatarValorCSV(valor: number): string {
  return valor.toFixed(2).replace('.', ',');
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

function rotuloTipoMovimentacao(contaId: number, mov: Pick<Movimentacao, 'tipo' | 'contaBancariaId'>): string {
  if (mov.tipo === 'entrada') return 'entrada';
  if (mov.tipo === 'saida') return 'saída';
  return mov.contaBancariaId === contaId ? 'transferência enviada' : 'transferência recebida';
}

/**
 * Extrato de uma conta: colunas data;tipo;descricao;categoria;valor;saldo_apos.
 * O saldo acumulado parte de `saldoInicial` e percorre TODAS as movimentações da conta em
 * ordem de data (mesma regra de `calcularSaldoConta`), mas só as linhas do período entram no CSV.
 */
export function gerarExtratoContaCSV(
  conta: Pick<ContaBancaria, 'id' | 'saldoInicial'>,
  movimentacoes: Movimentacao[],
  categoriasPorId: CategoriasPorId,
  periodo: PeriodoExtrato
): string {
  const daConta = movimentacoes
    .filter((m) => m.contaBancariaId === conta.id || (m.tipo === 'transferencia' && m.contaDestinoId === conta.id))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);

  const linhas: string[][] = [['data', 'tipo', 'descricao', 'categoria', 'valor', 'saldo_apos']];
  let saldo = conta.saldoInicial;

  for (const mov of daConta) {
    const efeito = efeitoMovimentacaoNaConta(conta.id, mov);
    saldo += efeito;
    if (periodo !== null && mov.data.slice(0, 7) !== periodo) continue;
    linhas.push([
      formatarData(mov.data),
      rotuloTipoMovimentacao(conta.id, mov),
      mov.descricao ?? '',
      nomeCategoria(mov.categoriaId, categoriasPorId),
      formatarValorCSV(efeito),
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

  const linhas: string[][] = [['data', 'descricao', 'parcela', 'categoria', 'valor', 'status']];
  for (const item of itens) {
    linhas.push([
      formatarData(item.data),
      item.descricao,
      item.parcela,
      item.categoria,
      formatarValorCSV(item.valor),
      item.status,
    ]);
  }
  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  linhas.push(['', 'TOTAL', '', '', formatarValorCSV(total), '']);

  return montarCSV(linhas);
}
