import { addMonths, format, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatarData(dataIso: string, padrao = 'dd/MM/yyyy'): string {
  return format(parseISO(dataIso), padrao, { locale: ptBR });
}

export function formatarMesReferencia(mesReferencia: string): string {
  // mesReferencia no formato 'YYYY-MM'
  return format(parseISO(`${mesReferencia}-01`), "MMMM 'de' yyyy", { locale: ptBR });
}

export function mesAnterior(mesReferencia: string): string {
  return format(subMonths(parseISO(`${mesReferencia}-01`), 1), 'yyyy-MM');
}

export function mesSeguinte(mesReferencia: string): string {
  return format(addMonths(parseISO(`${mesReferencia}-01`), 1), 'yyyy-MM');
}

/** Data de hoje no fuso do aparelho ('YYYY-MM-DD') — `toISOString` usaria UTC e viraria o dia cedo demais. */
export function hojeIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Mês atual no fuso do aparelho ('YYYY-MM'). */
export function mesAtualIso(): string {
  return format(new Date(), 'yyyy-MM');
}
