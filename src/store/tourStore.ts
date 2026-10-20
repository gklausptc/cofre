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
    id: 'acoes-rapidas',
    titulo: 'Comece importando o extrato',
    descricao:
      'Toque em Importar extrato (ou no + embaixo) e escolha o CSV ou OFX do seu banco. O app categoriza sozinho e só pergunta o que não souber.',
  },
  {
    id: 'pendencias',
    titulo: 'Responda as perguntas',
    descricao: 'O que a importação não soube resolver aparece aqui. Cada resposta vira uma regra para as próximas vezes.',
  },
  {
    id: 'livre',
    titulo: 'Livre para gastar',
    descricao: 'Quanto sobra até o fim do mês e quanto dá por dia. Toque para ver a conta.',
  },
  {
    id: 'proximos',
    titulo: 'Próximos 7 dias',
    descricao: 'O que vence nesta semana. Toque em Paguei para dar baixa; o resto fica na aba Agenda.',
  },
  {
    id: 'saldo',
    titulo: 'Seu dinheiro',
    descricao: 'Saldo nas contas, faturas em aberto e o que está guardado. Cada linha abre o detalhe.',
  },
  {
    id: 'menu',
    titulo: 'Tudo o mais',
    descricao: 'Cartões, contas, relatórios, regras aprendidas, notificações e backup ficam aqui.',
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
