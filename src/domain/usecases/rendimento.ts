import { addMonths, differenceInCalendarDays, differenceInMonths, format, parseISO } from 'date-fns';
import { diasUteisEntre } from '@/domain/usecases/diasUteis';
import { formatarCentesimos } from '@/core/utils/percentual';

/**
 * Rendimento estimado de cofrinhos e da reserva aplicados em renda fixa pós-fixada.
 * Tudo é estimativa: usa a taxa de hoje (informada pelo usuário, o app não tem internet)
 * como se ela valesse para todo o período. Taxas em centésimos de ponto percentual
 * (1490 = 14,90% a.a.; 10500 = 105% do CDI); dinheiro em centavos.
 */

export type Indexador = 'nenhum' | 'cdi' | 'selic' | 'poupanca';

export type ConfigRendimento = {
  indexador: Indexador;
  /** Percentual do indexador em centésimos: 10500 = 105% do CDI. Ignorado na poupança. */
  percentualIndexador: number;
  /** Cobra imposto de renda pela tabela regressiva (CDB, Tesouro). LCI/LCA e poupança não cobram. */
  cobraIr: boolean;
};

export type TaxasReferencia = {
  /** CDI anual em centésimos de % (1490 = 14,90% a.a.); null se o usuário ainda não informou. */
  cdiAnual: number | null;
  selicAnual: number | null;
};

/** Um aporte (valor positivo) ou retirada (negativo) numa data. */
export type Fluxo = { data: string; valor: number };

const DIAS_UTEIS_POR_ANO = 252;
/** Média de dias úteis num mês, usada nas projeções de longo prazo. */
const DIAS_UTEIS_POR_MES = 21;
/** Acima de 8,5% a.a. de Selic, a poupança rende 0,5% ao mês (mais TR). */
const LIMITE_SELIC_POUPANCA = 0.085;

const centesimosParaDecimal = (centesimos: number) => centesimos / 10000;

/** O indexador precisa de uma taxa que ainda não foi informada? */
export function faltaTaxa(config: ConfigRendimento, taxas: TaxasReferencia): boolean {
  if (config.indexador === 'cdi') return taxas.cdiAnual === null;
  if (config.indexador === 'selic' || config.indexador === 'poupanca') return taxas.selicAnual === null;
  return false;
}

/** Taxa por dia útil (cdi/selic) já com o percentual aplicado; 0 sem rendimento. */
function taxaPorDiaUtil(config: ConfigRendimento, taxas: TaxasReferencia): number {
  const anual = config.indexador === 'cdi' ? taxas.cdiAnual : config.indexador === 'selic' ? taxas.selicAnual : null;
  if (anual === null) return 0;
  const diaria = Math.pow(1 + centesimosParaDecimal(anual), 1 / DIAS_UTEIS_POR_ANO) - 1;
  return diaria * centesimosParaDecimal(config.percentualIndexador);
}

/** Poupança: 0,5% a.m. com Selic acima de 8,5% a.a.; senão 70% da Selic (TR não considerada). */
function taxaMensalPoupanca(taxas: TaxasReferencia): number {
  if (taxas.selicAnual === null) return 0;
  const selic = centesimosParaDecimal(taxas.selicAnual);
  if (selic > LIMITE_SELIC_POUPANCA) return 0.005;
  return Math.pow(1 + 0.7 * selic, 1 / 12) - 1;
}

/** Quanto R$ 1 vira entre as duas datas (início incluído, fim excluído). */
export function fatorEntre(config: ConfigRendimento, taxas: TaxasReferencia, inicioIso: string, fimIso: string): number {
  if (config.indexador === 'nenhum' || fimIso <= inicioIso) return 1;
  if (config.indexador === 'poupanca') {
    // rende só no aniversário: meses completos
    const meses = Math.max(0, differenceInMonths(parseISO(fimIso), parseISO(inicioIso)));
    return Math.pow(1 + taxaMensalPoupanca(taxas), meses);
  }
  return Math.pow(1 + taxaPorDiaUtil(config, taxas), diasUteisEntre(inicioIso, fimIso));
}

/** Taxa média de um mês, para projeções. */
function fatorMensalMedio(config: ConfigRendimento, taxas: TaxasReferencia): number {
  if (config.indexador === 'nenhum') return 1;
  if (config.indexador === 'poupanca') return 1 + taxaMensalPoupanca(taxas);
  return Math.pow(1 + taxaPorDiaUtil(config, taxas), DIAS_UTEIS_POR_MES);
}

/** Imposto de renda sobre renda fixa pela tabela regressiva, conforme os dias aplicados. */
export function aliquotaIr(dias: number): number {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

export type ResultadoRendimento = {
  /** Aportes − retiradas. */
  investido: number;
  /** Quanto vale hoje, antes do imposto. */
  saldoBruto: number;
  rendimentoBruto: number;
  /** IR estimado sobre o rendimento (0 se isento). */
  impostoEstimado: number;
  saldoLiquido: number;
  /** Prazo médio dos aportes, em dias (define a alíquota do IR). */
  prazoMedioDias: number;
};

/**
 * Valor estimado hoje de uma sequência de aportes e retiradas: cada movimento rende do seu
 * dia até `ateIso`. O IR é estimado sobre o rendimento total pela alíquota do prazo médio
 * dos aportes (IOF dos primeiros 30 dias não é considerado). null se falta a taxa.
 */
export function calcularRendimento(
  fluxos: Fluxo[],
  config: ConfigRendimento,
  taxas: TaxasReferencia,
  ateIso: string
): ResultadoRendimento | null {
  if (faltaTaxa(config, taxas)) return null;
  const doPeriodo = fluxos.filter((f) => f.data <= ateIso);
  const investido = doPeriodo.reduce((soma, f) => soma + f.valor, 0);
  const saldoBruto = Math.round(
    doPeriodo.reduce((soma, f) => soma + f.valor * fatorEntre(config, taxas, f.data, ateIso), 0)
  );
  const rendimentoBruto = saldoBruto - investido;

  const aportes = doPeriodo.filter((f) => f.valor > 0);
  const totalAportado = aportes.reduce((soma, f) => soma + f.valor, 0);
  const prazoMedioDias =
    totalAportado > 0
      ? Math.round(
          aportes.reduce((soma, f) => soma + f.valor * differenceInCalendarDays(parseISO(ateIso), parseISO(f.data)), 0) /
            totalAportado
        )
      : 0;

  const tributa = config.cobraIr && config.indexador !== 'poupanca' && config.indexador !== 'nenhum';
  const impostoEstimado = tributa && rendimentoBruto > 0 ? Math.round(rendimentoBruto * aliquotaIr(prazoMedioDias)) : 0;

  return {
    investido,
    saldoBruto,
    rendimentoBruto,
    impostoEstimado,
    saldoLiquido: saldoBruto - impostoEstimado,
    prazoMedioDias,
  };
}

export type RendimentoDoMes = {
  /** Percentual do mês inteiro, como fração (0,0098 = 0,98%). */
  percentual: number;
  /** Quanto o saldo informado rende no mês, em centavos. */
  valor: number;
  diasUteis: number;
};

/** "Este mês seu dinheiro rende 0,98% (R$ 49,00)": o mês inteiro, sobre o saldo atual. */
export function rendimentoDoMes(
  saldo: number,
  config: ConfigRendimento,
  taxas: TaxasReferencia,
  mes: string
): RendimentoDoMes | null {
  if (faltaTaxa(config, taxas) || config.indexador === 'nenhum') return null;
  const inicio = `${mes}-01`;
  const fim = format(addMonths(parseISO(inicio), 1), 'yyyy-MM-dd');
  const fator = fatorEntre(config, taxas, inicio, fim);
  return {
    percentual: fator - 1,
    valor: Math.round(saldo * (fator - 1)),
    diasUteis: diasUteisEntre(inicio, fim),
  };
}

export type SimulacaoAplicacao = {
  meses: number;
  /** Data em que a simulação termina ('YYYY-MM-DD'). */
  ate: string;
  rendimentoBruto: number;
  imposto: number;
  valorLiquido: number;
};

/** "Se eu aplicar R$ X no dia tal": quanto vira em cada prazo, já com o IR do prazo. */
export function simularAplicacao(
  valor: number,
  config: ConfigRendimento,
  taxas: TaxasReferencia,
  inicioIso: string,
  prazosEmMeses: number[] = [1, 3, 6, 12]
): SimulacaoAplicacao[] | null {
  if (faltaTaxa(config, taxas)) return null;
  const tributa = config.cobraIr && config.indexador !== 'poupanca' && config.indexador !== 'nenhum';
  return prazosEmMeses.map((meses) => {
    const ate = format(addMonths(parseISO(inicioIso), meses), 'yyyy-MM-dd');
    const rendimentoBruto = Math.round(valor * (fatorEntre(config, taxas, inicioIso, ate) - 1));
    const dias = differenceInCalendarDays(parseISO(ate), parseISO(inicioIso));
    const imposto = tributa && rendimentoBruto > 0 ? Math.round(rendimentoBruto * aliquotaIr(dias)) : 0;
    return { meses, ate, rendimentoBruto, imposto, valorLiquido: valor + rendimentoBruto - imposto };
  });
}

const LIMITE_MESES = 600;

/**
 * Plano para a meta: aportando `aporteMensal` todo mês (e rendendo), em quantos meses o saldo
 * chega em `valorMeta`. null se não chega em 50 anos. Valores brutos (antes do IR).
 */
export function mesesParaAtingirMeta(
  saldoAtual: number,
  aporteMensal: number,
  valorMeta: number,
  config: ConfigRendimento,
  taxas: TaxasReferencia
): number | null {
  if (saldoAtual >= valorMeta) return 0;
  if (faltaTaxa(config, taxas)) return null;
  const fator = fatorMensalMedio(config, taxas);
  let saldo = saldoAtual;
  for (let mes = 1; mes <= LIMITE_MESES; mes++) {
    saldo = saldo * fator + aporteMensal;
    if (saldo >= valorMeta) return mes;
  }
  return null;
}

/** Quanto aportar por mês para chegar na meta em `meses` meses (com rendimento). */
export function aporteMensalNecessario(
  saldoAtual: number,
  valorMeta: number,
  meses: number,
  config: ConfigRendimento,
  taxas: TaxasReferencia
): number | null {
  if (meses < 1 || faltaTaxa(config, taxas)) return null;
  const fator = fatorMensalMedio(config, taxas);
  const futuroDoSaldo = saldoAtual * Math.pow(fator, meses);
  if (futuroDoSaldo >= valorMeta) return 0;
  // soma de uma série de aportes no fim de cada mês: aporte × (fator^n − 1) / (fator − 1)
  const acumulacao = fator === 1 ? meses : (Math.pow(fator, meses) - 1) / (fator - 1);
  return Math.ceil((valorMeta - futuroDoSaldo) / acumulacao);
}

/** "105% do CDI", "100% da Selic", "Poupança", "Sem rendimento". */
export function descreverRendimento(config: ConfigRendimento): string {
  const percentual = formatarCentesimos(config.percentualIndexador);
  if (config.indexador === 'cdi') return `${percentual}% do CDI`;
  if (config.indexador === 'selic') return `${percentual}% da Selic`;
  if (config.indexador === 'poupanca') return 'Poupança';
  return 'Sem rendimento';
}
