/** Marcos da meta que merecem um aviso (em % da meta). */
export const MARCOS = [25, 50, 75, 100] as const;

/**
 * Maior marco que o aporte acabou de passar (antes abaixo, agora igual ou acima), ou null.
 * Um aporte grande que passa de 20% para 80% avisa só os 75%.
 */
export function marcoAtingido(antes: number, depois: number, meta: number): (typeof MARCOS)[number] | null {
  if (meta <= 0 || depois <= antes) return null;
  const passados = MARCOS.filter((m) => antes * 100 < m * meta && depois * 100 >= m * meta);
  return passados.length > 0 ? passados[passados.length - 1] : null;
}

/** Título e texto do aviso do marco, no tom do app (factual, sem exclamação). */
export function textoDoMarco(marco: (typeof MARCOS)[number], nome: string): { titulo: string; corpo: string } {
  if (marco === 100) return { titulo: `Meta atingida: ${nome}`, corpo: 'Você completou o valor do cofrinho.' };
  return { titulo: `${nome}: ${marco}% da meta`, corpo: `Falta${marco === 75 ? ' só' : ''} ${100 - marco}% para completar.` };
}
