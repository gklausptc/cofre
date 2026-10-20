/**
 * Bloqueio progressivo do PIN: as 4 primeiras tentativas erradas só avisam; a 5ª faz esperar
 * 30 s, a 6ª 1 min e da 7ª em diante 5 min cada. Um acerto (ou a biometria) zera a contagem.
 * O estado fica gravado no aparelho, então fechar e abrir o app não zera a espera.
 */

export const TENTATIVAS_ANTES_DO_BLOQUEIO = 5;

export type TentativasPin = {
  falhasSeguidas: number;
  /** Momento (ms desde 1970) até quando novas tentativas ficam bloqueadas. */
  bloqueadoAte: number | null;
};

export const SEM_FALHAS: TentativasPin = { falhasSeguidas: 0, bloqueadoAte: null };

/** Segundos de espera depois de N falhas seguidas. */
export function esperaAposFalhas(falhas: number): number {
  if (falhas < TENTATIVAS_ANTES_DO_BLOQUEIO) return 0;
  if (falhas === TENTATIVAS_ANTES_DO_BLOQUEIO) return 30;
  if (falhas === TENTATIVAS_ANTES_DO_BLOQUEIO + 1) return 60;
  return 300;
}

export function registrarFalhaPin(tentativas: TentativasPin, agora: number): TentativasPin {
  const falhasSeguidas = tentativas.falhasSeguidas + 1;
  const espera = esperaAposFalhas(falhasSeguidas);
  return { falhasSeguidas, bloqueadoAte: espera > 0 ? agora + espera * 1000 : null };
}

export function segundosDeEspera(tentativas: TentativasPin, agora: number): number {
  if (tentativas.bloqueadoAte === null) return 0;
  return Math.max(0, Math.ceil((tentativas.bloqueadoAte - agora) / 1000));
}

/** Quantas tentativas ainda dá para errar antes de ter que esperar. */
export function tentativasAntesDeEsperar(tentativas: TentativasPin): number {
  return Math.max(0, TENTATIVAS_ANTES_DO_BLOQUEIO - tentativas.falhasSeguidas);
}

/** "30 s", "1 min", "5 min" */
export function descreverEspera(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  return `${Math.ceil(segundos / 60)} min`;
}

/** Lê o estado gravado; qualquer coisa inválida vale como "sem falhas". */
export function lerTentativasPin(texto: string | null): TentativasPin {
  if (texto === null) return SEM_FALHAS;
  try {
    const valor: unknown = JSON.parse(texto);
    if (typeof valor !== 'object' || valor === null) return SEM_FALHAS;
    const { falhasSeguidas, bloqueadoAte } = valor as Record<string, unknown>;
    if (typeof falhasSeguidas !== 'number' || !Number.isInteger(falhasSeguidas) || falhasSeguidas < 0) return SEM_FALHAS;
    if (bloqueadoAte !== null && typeof bloqueadoAte !== 'number') return SEM_FALHAS;
    return { falhasSeguidas, bloqueadoAte };
  } catch {
    return SEM_FALHAS;
  }
}
