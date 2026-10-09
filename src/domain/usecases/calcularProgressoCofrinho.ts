import { differenceInCalendarMonths, parseISO } from 'date-fns';
import type { AporteCofrinho, Cofrinho } from '@/domain/types/entities';

export type ProgressoCofrinho = {
  valorAtual: number;
  percentual: number;
  previsaoMeses: number | null;
};

/**
 * Soma os aportes, calcula o percentual da meta, e projeta em quantos meses a
 * meta é atingida com base na média de aportes recentes. Sem histórico
 * suficiente (menos de 2 aportes), não mostra previsão.
 */
export function calcularProgressoCofrinho(
  cofrinho: Pick<Cofrinho, 'valorMeta'>,
  aportes: AporteCofrinho[]
): ProgressoCofrinho {
  const valorAtual = aportes.reduce((soma, a) => soma + a.valor, 0);
  const percentual = cofrinho.valorMeta > 0 ? Math.min(valorAtual / cofrinho.valorMeta, 1) : 0;

  if (aportes.length < 2 || valorAtual >= cofrinho.valorMeta) {
    return { valorAtual, percentual, previsaoMeses: null };
  }

  const datas = aportes.map((a) => parseISO(a.data)).sort((a, b) => a.getTime() - b.getTime());
  const mesesDecorridos = Math.max(differenceInCalendarMonths(datas[datas.length - 1], datas[0]), 1);
  const mediaMensal = valorAtual / mesesDecorridos;

  if (mediaMensal <= 0) {
    return { valorAtual, percentual, previsaoMeses: null };
  }

  const faltam = cofrinho.valorMeta - valorAtual;
  const previsaoMeses = Math.ceil(faltam / mediaMensal);

  return { valorAtual, percentual, previsaoMeses };
}
