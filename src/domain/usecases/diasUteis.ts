import { addDays, format, getDay, parseISO } from 'date-fns';

/**
 * Calendário de dias úteis no padrão do mercado (ANBIMA): segunda a sexta, menos os feriados
 * nacionais — fixos e os que dependem da Páscoa (Carnaval, Sexta-feira Santa, Corpus Christi).
 * É o calendário que o CDI e a Selic usam para render (base de 252 dias úteis por ano).
 */

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];

const cache = new Map<number, Set<string>>();

/** Feriados nacionais do ano, como 'YYYY-MM-DD'. */
export function feriadosNacionais(ano: number): Set<string> {
  const guardado = cache.get(ano);
  if (guardado) return guardado;

  const datas = FIXOS.map((diaMes) => `${ano}-${diaMes}`);
  // Dia Nacional de Zumbi e da Consciência Negra é feriado nacional desde 2024 (Lei 14.759/2023)
  if (ano >= 2024) datas.push(`${ano}-11-20`);
  const pascoa = domingoDePascoa(ano);
  for (const deslocamento of [-48, -47, -2, 60]) {
    datas.push(format(addDays(pascoa, deslocamento), 'yyyy-MM-dd'));
  }

  const feriados = new Set(datas);
  cache.set(ano, feriados);
  return feriados;
}

export function ehDiaUtil(data: Date): boolean {
  const semana = getDay(data);
  if (semana === 0 || semana === 6) return false;
  return !feriadosNacionais(data.getFullYear()).has(format(data, 'yyyy-MM-dd'));
}

/** Dias úteis de `inicio` (incluído) até `fim` (excluído). 0 se `fim` não é depois de `inicio`. */
export function diasUteisEntre(inicioIso: string, fimIso: string): number {
  let dia = parseISO(inicioIso);
  const fim = parseISO(fimIso);
  let total = 0;
  while (dia < fim) {
    if (ehDiaUtil(dia)) total++;
    dia = addDays(dia, 1);
  }
  return total;
}
