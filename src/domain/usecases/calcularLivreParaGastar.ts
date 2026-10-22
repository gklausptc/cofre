import { getDaysInMonth, parseISO } from 'date-fns';
import { mesAnterior } from '@/core/utils/date';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { AporteCofrinho, ContaBancaria, GastoRapido, Movimentacao, MovimentacaoReserva } from '@/domain/types/entities';

export type LivreParaGastar = {
  mes: string;
  /** O que passou do mês anterior nas contas (`calcularSobraDoMesAnterior`); pode ser negativo. */
  sobra: number;
  /** Entradas do mês, já recebidas ou previstas. */
  receitas: number;
  /** Contas fixas fora do cartão do mês (pagas ou não). */
  contasFixas: number;
  /** Faturas de cartão que vencem no mês (pagas ou não). */
  faturas: number;
  /** Gastos já feitos fora do cartão (débito, pix, dinheiro e saídas avulsas). */
  gastos: number;
  /** Guardado em cofrinhos e na reserva no mês, menos o que foi retirado da reserva. */
  guardado: number;
  /** sobra + receitas − contas fixas − faturas − gastos − guardado. */
  livre: number;
  /** Dias que faltam no mês contando hoje (0 se o mês já passou). */
  diasRestantes: number;
  /** Quanto dá para gastar por dia até o fim do mês (0 se não sobra nada). */
  porDia: number;
};

/**
 * Quanto ainda está livre para gastar no mês, a partir da lista unificada de lançamentos
 * (`obterLancamentosDoPeriodo`, que precisa cobrir do mês anterior até o fim deste — entrada
 * reservada no mês passado pesa neste) e do que sobrou do mês anterior (`sobra`). Compras no
 * cartão entram pela fatura, e pagamentos de fatura/conta fixa e transferências não contam (já
 * estão no compromisso, ou não são gasto).
 */
export function calcularLivreParaGastar(lancamentos: LancamentoDoPeriodo[], mes: string, hojeIso: string, sobra = 0): LivreParaGastar {
  const doMes = lancamentos.filter((l) => l.competencia === mes);
  const somar = (filtro: (l: LancamentoDoPeriodo) => boolean) =>
    doMes.filter(filtro).reduce((soma, l) => soma + l.valor, 0);

  const receitas = somar((l) => l.natureza === 'receita');
  const contasFixas = somar((l) => l.tipo === 'conta_fixa' && l.natureza === 'despesa' && !l.noCartao);
  const faturas = somar((l) => l.natureza === 'fatura');
  const gastos = somar(
    (l) => l.natureza === 'despesa' && !l.noCartao && (l.tipo === 'movimentacao' || l.tipo === 'gasto')
  );
  const guardado = somar((l) => l.natureza === 'guardado') - somar((l) => l.natureza === 'resgate');
  const livre = sobra + receitas - contasFixas - faturas - gastos - guardado;

  const diasNoMes = getDaysInMonth(parseISO(`${mes}-01`));
  const mesDeHoje = hojeIso.slice(0, 7);
  const diasRestantes =
    mes < mesDeHoje ? 0 : mes > mesDeHoje ? diasNoMes : diasNoMes - Number(hojeIso.slice(8, 10)) + 1;
  const porDia = diasRestantes > 0 && livre > 0 ? Math.floor(livre / diasRestantes) : 0;

  return { mes, sobra, receitas, contasFixas, faturas, gastos, guardado, livre, diasRestantes, porDia };
}

export type DadosDaSobra = {
  /** As contas que contam no saldo (as ativas, como em "Em contas"). */
  contas: Pick<ContaBancaria, 'id' | 'saldoInicial'>[];
  movimentacoes: Movimentacao[];
  gastos: GastoRapido[];
  aportesCofrinho?: Pick<AporteCofrinho, 'valor' | 'data'>[];
  movimentacoesReserva?: Pick<MovimentacaoReserva, 'tipo' | 'valor' | 'data'>[];
};

/**
 * O dinheiro que passa do mês anterior para `mes`: o saldo das contas no último dia dele, menos
 * as entradas que já tinham caído mas foram reservadas para `mes` (contam como entrada de `mes`)
 * e menos o que estava guardado em cofrinhos e na reserva. O guardado só desconta até o que
 * havia nas contas, porque o dinheiro dele pode estar fora delas (uma aplicação em outro banco).
 * Sem a sobra, o salário que cai no último dia do mês deixava o mês seguinte negativo.
 */
export function calcularSobraDoMesAnterior(mes: string, d: DadosDaSobra): number {
  const anterior = mesAnterior(mes);
  const fim = dataNoMes(anterior, 31);
  const movimentacoes = d.movimentacoes.filter((m) => m.data <= fim);
  const gastos = d.gastos.filter((g) => g.data <= fim);
  const saldo = d.contas.reduce((soma, c) => soma + calcularSaldoConta(c, movimentacoes, gastos), 0);

  const doApp = new Set(d.contas.map((c) => c.id));
  const reservadas = movimentacoes
    .filter((m) => m.tipo === 'entrada' && m.origem !== 'interna' && m.reservarProximoMes && m.data.startsWith(anterior) && doApp.has(m.contaBancariaId))
    .reduce((soma, m) => soma + m.valor, 0);
  const guardado =
    (d.aportesCofrinho ?? []).filter((a) => a.data <= fim).reduce((soma, a) => soma + a.valor, 0) +
    (d.movimentacoesReserva ?? []).filter((m) => m.data <= fim).reduce((soma, m) => soma + (m.tipo === 'aporte' ? m.valor : -m.valor), 0);

  const nasContas = saldo - reservadas;
  return nasContas - Math.min(Math.max(0, guardado), Math.max(0, nasContas));
}
