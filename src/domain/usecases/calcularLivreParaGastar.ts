import { getDaysInMonth, parseISO } from 'date-fns';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

export type LivreParaGastar = {
  mes: string;
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
  /** receitas − contas fixas − faturas − gastos − guardado. */
  livre: number;
  /** Dias que faltam no mês contando hoje (0 se o mês já passou). */
  diasRestantes: number;
  /** Quanto dá para gastar por dia até o fim do mês (0 se não sobra nada). */
  porDia: number;
};

/**
 * Quanto ainda está livre para gastar no mês, a partir da lista unificada de lançamentos
 * (`obterLancamentosDoPeriodo`, que precisa cobrir do mês anterior até o fim deste — entrada
 * reservada no mês passado pesa neste). Compras no cartão entram pela fatura, e pagamentos
 * de fatura/conta fixa e transferências não contam (já estão no compromisso, ou não são gasto).
 */
export function calcularLivreParaGastar(lancamentos: LancamentoDoPeriodo[], mes: string, hojeIso: string): LivreParaGastar {
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
  const livre = receitas - contasFixas - faturas - gastos - guardado;

  const diasNoMes = getDaysInMonth(parseISO(`${mes}-01`));
  const mesDeHoje = hojeIso.slice(0, 7);
  const diasRestantes =
    mes < mesDeHoje ? 0 : mes > mesDeHoje ? diasNoMes : diasNoMes - Number(hojeIso.slice(8, 10)) + 1;
  const porDia = diasRestantes > 0 && livre > 0 ? Math.floor(livre / diasRestantes) : 0;

  return { mes, receitas, contasFixas, faturas, gastos, guardado, livre, diasRestantes, porDia };
}
