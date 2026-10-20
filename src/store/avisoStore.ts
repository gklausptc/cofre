import { create } from 'zustand';

export type Aviso = {
  mensagem: string;
  /** Botão "Desfazer" (opcional). */
  desfazer?: () => void;
  /** Roda quando o aviso some sem desfazer (ex.: apagar a foto do comprovante de vez). */
  aoExpirar?: () => void;
};

type AvisoState = {
  aviso: Aviso | null;
  mostrar: (aviso: Aviso) => void;
  /** Fecha o aviso; `desfeito` = o usuário tocou em Desfazer (aí `aoExpirar` não roda). */
  fechar: (desfeito?: boolean) => void;
};

/** Snackbar do app inteiro: confirmações destrutivas viram "feito · Desfazer" por 5 s. */
export const useAvisoStore = create<AvisoState>((set, get) => ({
  aviso: null,
  mostrar: (aviso) => {
    const anterior = get().aviso;
    anterior?.aoExpirar?.();
    set({ aviso });
  },
  fechar: (desfeito = false) => {
    const atual = get().aviso;
    if (!desfeito) atual?.aoExpirar?.();
    set({ aviso: null });
  },
}));
