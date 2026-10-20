import { differenceInCalendarDays, parseISO } from 'date-fns';
import { normalizarDescricao } from './normalizarDescricao';
import type { TransacaoLida } from './tipos';

/** Hash FNV-1a de 32 bits em hexadecimal: estável entre execuções, sem depender de crypto. */
export function hashTexto(texto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

function trigramas(texto: string): Set<string> {
  const comBorda = `  ${texto} `;
  const conjunto = new Set<string>();
  for (let i = 0; i < comBorda.length - 2; i++) conjunto.add(comBorda.slice(i, i + 3));
  return conjunto;
}

/**
 * Semelhança entre duas descrições, de 0 a 1: o maior entre Levenshtein normalizado e
 * trigramas (Jaccard). Uma contida na outra ("MERCADO" em "SUPERMERCADO EXTRA") vale 0,8.
 */
export function semelhanca(a: string, b: string): number {
  const x = normalizarDescricao(a).normalizada;
  const y = normalizarDescricao(b).normalizada;
  if (x === '' || y === '') return 0;
  if (x === y) return 1;

  const levenshtein = 1 - distanciaLevenshtein(x, y) / Math.max(x.length, y.length);
  const tx = trigramas(x);
  const ty = trigramas(y);
  const comuns = [...tx].filter((t) => ty.has(t)).length;
  const jaccard = comuns / (tx.size + ty.size - comuns);
  const contida = Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)) ? 0.8 : 0;
  return Math.max(levenshtein, jaccard, contida);
}

/** Marca de parcela da linha (coluna própria ou "3/10" no texto). */
function marcaDaLinha(linha: { descricao: string; parcela?: TransacaoLida['parcela'] }): TransacaoLida['parcela'] {
  return linha.parcela ?? normalizarDescricao(linha.descricao).parcela;
}

/**
 * Identificador de uma linha de CSV (que não tem FITID): banco, data, valor, descrição
 * normalizada, a marca de parcela (C6 e Itaú mandam todas as parcelas com a data da compra
 * original: sem a marca, a 4/10 teria o mesmo id da 3/10) e a ordem entre linhas idênticas no
 * mesmo arquivo. Importar de novo o mesmo extrato (ou um que se sobrepõe a ele) gera os mesmos ids.
 */
export function idExternoDeLinhas(
  linhas: (Pick<TransacaoLida, 'data' | 'valor' | 'descricao'> & { parcela?: TransacaoLida['parcela'] })[],
  prefixo: string
): string[] {
  const vistas = new Map<string, number>();
  return linhas.map((linha) => {
    const marca = marcaDaLinha(linha);
    const chave =
      `${linha.data}|${linha.valor}|${normalizarDescricao(linha.descricao).normalizada}` +
      (marca ? `|p${marca.numero}/${marca.total}` : '');
    const ocorrencia = (vistas.get(chave) ?? 0) + 1;
    vistas.set(chave, ocorrencia);
    return `${prefixo}:${hashTexto(`${chave}|${ocorrencia}`)}`;
  });
}

/** Lançamento que já está no app (na mesma conta ou cartão), para comparar. */
export type LancamentoExistente = {
  id: string;
  data: string;
  /** Mesma convenção de sinal da transação lida. */
  valor: number;
  descricao: string;
  idExterno: string | null;
  /** Transferência entre contas suas (ou entrada/saída interna): o outro lado já está no app. */
  transferencia?: boolean;
};

export type SituacaoDuplicidade =
  | { tipo: 'nova' }
  /** Mesmo id externo: essa linha já foi importada antes. */
  | { tipo: 'ja_importada'; existenteId: string }
  /** Mesmo valor, data perto e descrição muito parecida: com certeza já foi lançada à mão. */
  | { tipo: 'duplicata'; existenteId: string; semelhanca: number }
  /** Pode ser a mesma coisa lançada à mão: vira pergunta. */
  | { tipo: 'duvida'; existenteId: string; semelhanca: number };

export const DIAS_DE_TOLERANCIA = 2;
export const SEMELHANCA_MINIMA = 0.6;
export const SEMELHANCA_CERTEZA = 0.85;

/**
 * Para cada transação do extrato: é nova, já foi importada (mesmo id externo), é com certeza
 * uma duplicata de um lançamento manual (mesmo valor, data ±2 dias, descrição ≥ 0,85 de
 * semelhança) ou é uma dúvida (≥ 0,6, ou mesmo valor no mesmo dia com descrição diferente).
 * Cada lançamento existente casa com no máximo uma transação.
 */
export function deduplicar(transacoes: TransacaoLida[], existentes: LancamentoExistente[]): SituacaoDuplicidade[] {
  const porIdExterno = new Map(existentes.filter((e) => e.idExterno).map((e) => [e.idExterno, e]));
  const usados = new Set<string>();

  // 1ª passada: o que já foi importado (mesmo id externo) sai da disputa antes da comparação
  // por semelhança — assim reimportar o mesmo mês em outro formato (OFX e depois CSV) também casa
  const porId = transacoes.map((t) => {
    const mesmoId = porIdExterno.get(t.idExterno);
    if (mesmoId) usados.add(mesmoId.id);
    return mesmoId;
  });

  return transacoes.map((t, indice): SituacaoDuplicidade => {
    const mesmoId = porId[indice];
    if (mesmoId) return { tipo: 'ja_importada', existenteId: mesmoId.id };

    let melhor: { existente: LancamentoExistente; nota: number; mesmoDia: boolean } | null = null;
    const marca = marcaDaLinha(t);
    for (const existente of existentes) {
      if (usados.has(existente.id) || existente.valor !== t.valor) continue;
      // parcelas diferentes da mesma compra (3/10 e 4/10) nunca são a mesma linha
      const marcaExistente = normalizarDescricao(existente.descricao).parcela;
      if (marca && marcaExistente && (marca.numero !== marcaExistente.numero || marca.total !== marcaExistente.total)) continue;
      const dias = Math.abs(differenceInCalendarDays(parseISO(existente.data), parseISO(t.data)));
      if (dias > DIAS_DE_TOLERANCIA) continue;
      // o outro lado de uma transferência entre contas suas tem outro texto em cada banco
      // ("Transferido da poupança" × "Transferência para conta corrente"): valor e data bastam
      const nota = existente.transferencia && dias <= 1 ? 1 : semelhanca(existente.descricao, t.descricao);
      if (!melhor || nota > melhor.nota) melhor = { existente, nota, mesmoDia: dias === 0 };
    }

    if (!melhor) return { tipo: 'nova' };
    if (melhor.nota >= SEMELHANCA_CERTEZA) {
      usados.add(melhor.existente.id);
      return { tipo: 'duplicata', existenteId: melhor.existente.id, semelhanca: melhor.nota };
    }
    if (melhor.nota >= SEMELHANCA_MINIMA || melhor.mesmoDia) {
      usados.add(melhor.existente.id);
      return { tipo: 'duvida', existenteId: melhor.existente.id, semelhanca: melhor.nota };
    }
    return { tipo: 'nova' };
  });
}
