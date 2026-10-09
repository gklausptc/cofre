import { create } from 'zustand';
import type { RefObject } from 'react';

/** Forma mínima que tanto `View` quanto `Pressable` (via ref encaminhada) satisfazem. */
export type AlvoMedivel = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };

export type PassoTour = {
  id: string;
  titulo: string;
  descricao: string;
};

export const PASSOS_TOUR: PassoTour[] = [
  {
    id: 'tema',
    titulo: 'Troque o tema',
    descricao: 'Toque aqui pra alternar entre claro, escuro e o tema do sistema.',
  },
  {
    id: 'acoes-rapidas',
    titulo: 'Ações rápidas',
    descricao: 'Atalhos pra cadastrar movimentação, gasto rápido, conta bancária, conta fixa ou cofrinho sem navegar por menus.',
  },
  {
    id: 'saldo',
    titulo: 'Saldo em contas',
    descricao: 'O total de todas as suas contas bancárias. Toque no card pra ver o detalhe de cada uma.',
  },
  {
    id: 'resumo-mes',
    titulo: 'Resumo do mês',
    descricao: 'Quanto entrou, quanto saiu e o saldo do mês. Toque pra abrir o relatório completo.',
  },
  {
    id: 'gastos-fixos',
    titulo: 'Gastos fixos do mês',
    descricao: 'Contas fixas que vencem este mês, com o que já foi pago e o que ainda falta.',
  },
  {
    id: 'fab',
    titulo: 'Gasto rápido',
    descricao: 'Registre um gasto em segundos a qualquer momento, tocando neste botão.',
  },
];

type TourState = {
  ativo: boolean;
  indice: number;
  alvos: Record<string, RefObject<AlvoMedivel | null>>;
  aoFinalizar: (() => void) | null;
  registrarAlvo: (id: string, ref: RefObject<AlvoMedivel | null>) => void;
  iniciar: (aoFinalizar: () => void) => void;
  avancar: () => void;
  pular: () => void;
};

export const useTourStore = create<TourState>((set, get) => ({
  ativo: false,
  indice: 0,
  alvos: {},
  aoFinalizar: null,

  registrarAlvo: (id, ref) => {
    set((s) => ({ alvos: { ...s.alvos, [id]: ref } }));
  },

  iniciar: (aoFinalizar) => set({ ativo: true, indice: 0, aoFinalizar }),

  avancar: () => {
    const { indice, aoFinalizar } = get();
    if (indice >= PASSOS_TOUR.length - 1) {
      set({ ativo: false });
      aoFinalizar?.();
      return;
    }
    set({ indice: indice + 1 });
  },

  pular: () => {
    const { aoFinalizar } = get();
    set({ ativo: false });
    aoFinalizar?.();
  },
}));
