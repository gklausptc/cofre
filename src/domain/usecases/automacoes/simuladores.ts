import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { dividirEmParcelas, formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia } from '@/core/utils/date';
import { dataNoMes, mesDeCobrancaDaParcela, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import type { ProjecaoMes } from '@/domain/usecases/projetarFluxoCaixa';
import type { Cartao, CompraParcelada, ContaFixa, Parcela } from '@/domain/types/entities';

type DiasDoCartao = Pick<Cartao, 'id' | 'nome' | 'diaFechamento' | 'diaVencimento'>;

const nomeDoMes = (mes: string) => formatarMesReferencia(mes).split(' ')[0];

// ---------------------------------------------------------------- "Dá para comprar?"

export type VereditoDaCompra = 'da' | 'apertado' | 'nao_da' | 'sem_renda';

export type SimulacaoDeCompra = {
  veredito: VereditoDaCompra;
  titulo: string;
  detalhe: string;
  /** Mês a mês: antes e depois da compra. */
  meses: { mes: string; sobraAntes: number; sobraDepois: number; parcela: number; receita: number }[];
  /** Menor número de parcelas (até 12) que cabe sem apertar, quando a escolhida aperta. */
  alternativa: number | null;
};

/** Sobra abaixo de 10% da renda prevista do mês = apertado. */
export const MARGEM_APERTADO = 0.1;

/** Em que mês cai cada parcela: na fatura do cartão (pela data de hoje) ou no próprio mês. */
export function mesesDasParcelas(dataCompra: string, parcelas: number, cartao: DiasDoCartao | null): string[] {
  const primeiro = cartao
    ? mesDeCobrancaDoGasto({ data: dataCompra, formaPagamento: 'cartao', cartaoId: cartao.id }, new Map([[cartao.id, cartao]]))
    : dataCompra.slice(0, 7);
  return Array.from({ length: parcelas }, (_, i) => format(addMonths(parseISO(`${primeiro}-01`), i), 'yyyy-MM'));
}

function avaliar(projecao: ProjecaoMes[], valor: number, parcelas: number, dataCompra: string, cartao: DiasDoCartao | null) {
  const valores = dividirEmParcelas(valor, parcelas);
  const mesesDaCompra = mesesDasParcelas(dataCompra, parcelas, cartao);
  const porMes = new Map<string, number>();
  mesesDaCompra.forEach((m, i) => porMes.set(m, (porMes.get(m) ?? 0) + valores[i]));
  const meses = projecao.map((p) => {
    const parcela = porMes.get(p.mes) ?? 0;
    return { mes: p.mes, sobraAntes: p.saldoPrevisto, sobraDepois: p.saldoPrevisto - parcela, parcela, receita: p.receitaPrevista };
  });
  const afetados = meses.filter((m) => m.parcela > 0);
  const pior = [...afetados].sort((a, b) => a.sobraDepois - b.sobraDepois)[0] ?? null;
  return { meses, pior };
}

/**
 * Impacto de uma compra na sobra dos próximos meses (projetarFluxoCaixa): cada parcela entra
 * no mês da fatura em que cai. O veredito vem do mês mais justo; também confere o limite do
 * cartão. "Apertado" = sobra menor que 10% da renda prevista do mês.
 */
export function simularCompra(params: {
  valor: number;
  parcelas: number;
  cartao: DiasDoCartao | null;
  limiteDisponivel: number | null;
  dataCompra: string;
  projecao: ProjecaoMes[];
}): SimulacaoDeCompra {
  const { valor, parcelas, cartao, limiteDisponivel, dataCompra, projecao } = params;
  const { meses, pior } = avaliar(projecao, valor, parcelas, dataCompra, cartao);
  const vazio = { meses, alternativa: null };

  if (projecao.every((p) => p.receitaPrevista === 0)) {
    return { ...vazio, veredito: 'sem_renda', titulo: 'Cadastre sua renda para simular', detalhe: 'Sem salário ou outra entrada prevista, não dá para saber quanto sobra.' };
  }
  if (cartao && limiteDisponivel !== null && valor > limiteDisponivel) {
    return {
      ...vazio,
      veredito: 'nao_da',
      titulo: 'Não dá agora',
      detalhe: `O limite disponível do ${cartao.nome} é ${formatarMoeda(Math.max(0, limiteDisponivel))}.`,
    };
  }
  if (!pior) {
    return { ...vazio, veredito: 'da', titulo: 'Dá para comprar', detalhe: 'A compra cai depois dos meses da projeção.' };
  }

  const apertou = (m: { sobraDepois: number; receita: number }) => m.sobraDepois < m.receita * MARGEM_APERTADO;
  const alternativa = (() => {
    if (!apertou(pior)) return null;
    for (let n = parcelas + 1; n <= 12; n++) {
      const teste = avaliar(projecao, valor, n, dataCompra, cartao).pior;
      if (teste && !apertou(teste) && teste.sobraDepois >= 0) return n;
    }
    return null;
  })();

  if (pior.sobraDepois < 0) {
    return {
      meses,
      alternativa,
      veredito: 'nao_da',
      titulo: 'Não dá agora',
      detalhe: `${nomeDoMes(pior.mes).replace(/^./, (c) => c.toUpperCase())} fica ${formatarMoeda(Math.abs(pior.sobraDepois))} no negativo.`,
    };
  }
  if (apertou(pior)) {
    const pct = pior.receita > 0 ? Math.round((pior.sobraDepois / pior.receita) * 100) : 0;
    return {
      meses,
      alternativa,
      veredito: 'apertado',
      titulo: `Dá, mas ${nomeDoMes(pior.mes)} fica apertado`,
      detalhe: `Sobram ${formatarMoeda(pior.sobraDepois)} em ${nomeDoMes(pior.mes)} (${pct}% da renda).`,
    };
  }
  return {
    meses,
    alternativa: null,
    veredito: 'da',
    titulo: 'Dá para comprar',
    detalhe: `O mês mais justo é ${nomeDoMes(pior.mes)}, com sobra de ${formatarMoeda(pior.sobraDepois)}.`,
  };
}

// ---------------------------------------------------------------- quitação

export type SimulacaoDeQuitacao = {
  compraId: number;
  descricao: string;
  parcelasRestantes: number;
  /** Quanto pagar hoje para quitar (sem desconto de juros, que depende do banco). */
  totalRestante: number;
  /** Quanto deixa de sair por mês. */
  liberaPorMes: number;
  /** Meses que ficam livres dessa parcela. */
  meses: string[];
};

/** Adiantar as parcelas pendentes de uma compra: quanto custa hoje e quanto libera por mês. */
export function simularQuitacao(
  compra: Pick<CompraParcelada, 'id' | 'descricao' | 'cartaoId'>,
  parcelas: Pick<Parcela, 'compraParceladaId' | 'contaFixaId' | 'valor' | 'status' | 'mesReferencia' | 'numero'>[],
  cartoes: DiasDoCartao[],
  mesAtual: string
): SimulacaoDeQuitacao | null {
  const cartoesPorId = new Map(cartoes.map((c) => [c.id, c]));
  const comprasPorId = new Map([[compra.id, { cartaoId: compra.cartaoId }]]);
  const pendentes = parcelas
    .filter((p) => p.compraParceladaId === compra.id && p.status === 'pendente')
    .map((p) => ({ ...p, mes: mesDeCobrancaDaParcela(p, new Map(), comprasPorId, cartoesPorId) }))
    .filter((p) => p.mes > mesAtual)
    .sort((a, b) => a.numero - b.numero);
  if (pendentes.length === 0) return null;
  return {
    compraId: compra.id,
    descricao: compra.descricao,
    parcelasRestantes: pendentes.length,
    totalRestante: pendentes.reduce((s, p) => s + p.valor, 0),
    liberaPorMes: Math.max(...pendentes.map((p) => p.valor)),
    meses: pendentes.map((p) => p.mes),
  };
}

// ---------------------------------------------------------------- melhor cartão

export type CartaoParaHoje = {
  cartaoId: number;
  nome: string;
  /** Vencimento da fatura em que a compra de hoje cai. */
  vencimento: string;
  diasAtePagar: number;
};

/** Cartões ordenados pelo prazo até pagar uma compra feita hoje (o melhor primeiro). */
export function melhorCartaoParaHoje(
  cartoes: (DiasDoCartao & { ativo?: boolean | null })[],
  hoje: string,
  limites: Map<number, number> = new Map()
): CartaoParaHoje[] {
  return cartoes
    .filter((c) => c.ativo !== false && (limites.get(c.id) ?? 1) > 0)
    .map((c) => {
      const mes = mesDeCobrancaDoGasto({ data: hoje, formaPagamento: 'cartao', cartaoId: c.id }, new Map([[c.id, c]]));
      const vencimento = dataNoMes(mes, c.diaVencimento);
      return { cartaoId: c.id, nome: c.nome, vencimento, diasAtePagar: differenceInCalendarDays(parseISO(vencimento), parseISO(hoje)) };
    })
    .sort((a, b) => b.diasAtePagar - a.diasAtePagar);
}

/** "C6, vence 12/12 (52 dias)". */
export function descreverCartaoParaHoje(c: CartaoParaHoje): string {
  return `${c.nome}, vence ${formatarData(c.vencimento, 'dd/MM')} (${c.diasAtePagar} dias)`;
}

// ---------------------------------------------------------------- reserva de emergência

const POR_MES: Record<ContaFixa['recorrencia'], number> = { mensal: 1, quinzenal: 2, semanal: 52 / 12, anual: 1 / 12, unica: 0 };

/**
 * Custo fixo mensal real: contas fixas ativas (convertidas para o mês) mais a média das
 * parcelas de compras dos próximos 3 meses.
 */
export function custoFixoMensal(
  contasFixas: Pick<ContaFixa, 'valor' | 'recorrencia' | 'ativo'>[],
  parcelas: Pick<Parcela, 'compraParceladaId' | 'valor' | 'mesReferencia' | 'status'>[],
  mesAtual: string
): number {
  const fixas = contasFixas.filter((c) => c.ativo !== false).reduce((s, c) => s + c.valor * POR_MES[c.recorrencia], 0);
  const proximos = [0, 1, 2].map((i) => format(addMonths(parseISO(`${mesAtual}-01`), i), 'yyyy-MM'));
  const deParcelas = parcelas
    .filter((p) => p.compraParceladaId !== null && proximos.includes(p.mesReferencia))
    .reduce((s, p) => s + p.valor, 0);
  return Math.round(fixas + deParcelas / 3);
}

export const MESES_DA_RESERVA = 6;

/** Meta sugerida para a reserva: 6 meses do custo fixo, arredondada para cima em R$ 100. */
export function sugerirMetaDaReserva(custoMensal: number): number {
  return Math.ceil((custoMensal * MESES_DA_RESERVA) / 10000) * 10000;
}

/** Quantos meses de custo fixo a reserva cobre (uma casa decimal). */
export function mesesCobertos(saldoReserva: number, custoMensal: number): number | null {
  if (custoMensal <= 0) return null;
  return Math.floor((saldoReserva / custoMensal) * 10) / 10;
}
