import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import { planejarResposta, type RespostaPergunta } from '@/domain/usecases/importacao/responderPergunta';
import type { PerguntaPendente } from '@/domain/types/entities';
import type { DadosDaPergunta } from '@/domain/types/perguntas';

const repo = () => repositorios().perguntas;

type PerguntasState = {
  perguntas: PerguntaPendente[];
  carregar: () => Promise<void>;
  /** Aplica a resposta (atualiza as linhas, cria regra/contato/compra/conta fixa) e tira a pergunta da fila. */
  responder: (pergunta: PerguntaPendente, resposta: RespostaPergunta) => Promise<void>;
};

export function dadosDaPergunta(pergunta: PerguntaPendente): DadosDaPergunta {
  return JSON.parse(pergunta.dados) as DadosDaPergunta;
}

export const usePerguntasStore = create<PerguntasState>((set, get) => ({
  perguntas: [],

  carregar: async () => {
    set({ perguntas: await repo().listarPendentes() });
  },

  responder: async (pergunta, resposta) => {
    const repos = repositorios();
    const [cartoes, gastos] = await Promise.all([repos.cartoes.listarCartoes(), repos.gastosRapidos.listarGastosRapidos()]);
    const plano = planejarResposta(dadosDaPergunta(pergunta), resposta, { agora: new Date(), cartoes, gastos });
    await repo().responder(pergunta.id, plano);
    await get().carregar();
  },
}));
