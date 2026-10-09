import { create } from 'zustand';

type BloqueioState = {
  desbloqueado: boolean;
  desbloquear: () => void;
};

/**
 * Estado de sessão (não persistido) — se o app tem bloqueio por PIN/biometria
 * ativo (ver `preferenciasStore`), a tela de bloqueio fica visível até
 * `desbloquear()` ser chamado; volta a `false` a cada nova abertura do app.
 */
export const useBloqueioStore = create<BloqueioState>((set) => ({
  desbloqueado: false,
  desbloquear: () => set({ desbloqueado: true }),
}));
