import { semAcentos } from './normalizarDescricao';

/** Partículas que não ajudam a comparar nomes ("GREGORY KLAUS DA SILVA"). */
const PARTICULAS = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);

function partes(nome: string): string[] {
  return semAcentos(nome)
    .replace(/[^A-Z ]+/g, ' ')
    .split(' ')
    .filter((p) => p !== '' && !PARTICULAS.has(p));
}

/** Um pedaço do nome casa com outro: igual, abreviado ("K" de KLAUS) ou cortado ("PE" de PEREIRA). */
function casa(a: string, b: string): boolean {
  if (a === b) return true;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  return longo.startsWith(curto);
}

/**
 * O nome do PIX/transferência é o do titular? Os bancos abreviam e cortam o nome de jeitos
 * diferentes ("GREGORY K SILVA PEREIRA" no BB, "GREGORY KLAUS DA SILVA PE" no PIX): vale quando
 * o primeiro nome é igual e pelo menos dois dos outros pedaços (ou o único, se tiver 3 letras ou
 * mais) casam. Parentes têm outro primeiro nome, então não se confundem.
 */
export function ehNomeProprio(nome: string, nomesProprios: string[]): boolean {
  const alvo = partes(nome);
  if (alvo.length < 2) return false;
  return nomesProprios.some((proprio) => {
    const meu = partes(proprio);
    if (meu.length < 2 || meu[0] !== alvo[0]) return false;
    const [menor, maior] = meu.length <= alvo.length ? [meu, alvo] : [alvo, meu];
    const restoMaior = [...maior.slice(1)];
    let casados = 0;
    for (const pedaco of menor.slice(1)) {
      const indice = restoMaior.findIndex((outro) => casa(pedaco, outro));
      if (indice >= 0) {
        casados++;
        restoMaior.splice(indice, 1);
      }
    }
    const precisa = menor.length - 1 >= 2 ? 2 : 1;
    if (casados < precisa) return false;
    // com um pedaço só para comparar, ele tem que ser um sobrenome de verdade, não uma inicial
    return precisa === 2 || menor[1].length >= 3;
  });
}

/**
 * A descrição do extrato traz o nome do titular em algum ponto ("PIX ENVIADO 01/10 GREGORY K
 * SILVA", "TRANSFERIDO DA POUPANCA GREGORY K SILVA PEREIRA")? Procura a partir de cada
 * ocorrência do primeiro nome.
 */
export function contemNomeProprio(texto: string, nomesProprios: string[]): boolean {
  if (nomesProprios.length === 0) return false;
  const pedacos = partes(texto);
  const primeiros = new Set(nomesProprios.map((n) => partes(n)[0]).filter((p): p is string => p !== undefined));
  return pedacos.some((p, i) => primeiros.has(p) && ehNomeProprio(pedacos.slice(i).join(' '), nomesProprios));
}

/** Junta um nome novo à lista (sem repetir quem já é reconhecido). */
export function juntarNomeProprio(nomesProprios: string[], novo: string | null): string[] {
  if (!novo) return nomesProprios;
  const limpo = semAcentos(novo).replace(/\s+/g, ' ').trim();
  if (partes(limpo).length < 2 || ehNomeProprio(limpo, nomesProprios)) return nomesProprios;
  return [...nomesProprios, limpo];
}

export function lerNomesProprios(json: string | null): string[] {
  if (!json) return [];
  try {
    const lista = JSON.parse(json) as unknown;
    return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
