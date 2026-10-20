import { textoParaCentavos } from './currency';

/**
 * Percentuais e taxas. Taxas são guardadas em centésimos de ponto percentual
 * (1490 = 14,90% a.a.; 10500 = 105% do CDI), inteiros como o dinheiro.
 */

/** Fração como percentual: 0,0098 → "0,98%". */
export function formatarPercentual(fracao: number, casas = 2): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** Centésimos como número com vírgula, sem zeros sobrando: 10500 → "105", 1490 → "14,9". */
export function formatarCentesimos(centesimos: number): string {
  return (centesimos / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** Texto digitado ("105", "14,90", "14.9") para centésimos; NaN se não for número. */
export function textoParaCentesimos(texto: string): number {
  return textoParaCentavos(texto);
}
