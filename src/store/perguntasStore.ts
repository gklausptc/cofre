import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import { planejarResposta, type RespostaPergunta } from '@/domain/usecases/importacao/responderPergunta';
import { reavaliarPerguntas } from '@/domain/usecases/importacao/reavaliarPerguntas';
import { historicoDeCategorias, prepararCategorizador } from '@/domain/usecases/importacao/categorizar';
import { lerNomesProprios } from '@/domain/usecases/importacao/nomesProprios';
import type { PerguntaPendente } from '@/domain/types/entities';
import type { DadosDaPergunta } from '@/domain/types/perguntas';
import { pedirReagendamento } from '@/core/notifications/agendador';

const repo = () => repositorios().perguntas;

type PerguntasState = {
  perguntas: PerguntaPendente[];
  carregar: () => Promise<void>;
  /** Aplica a resposta (atualiza as linhas, cria regra/contato/compra/conta fixa) e tira a pergunta da fila. */
  responder: (pergunta: PerguntaPendente, resposta: RespostaPergunta) => Promise<void>;
  /**
   * Responde sozinho o que o app agora sabe (dicionário, regras, contatos, o seu nome) e junta
   * perguntas repetidas. Devolve quantas foram resolvidas.
   */
  reavaliar: () => Promise<{ resolvidas: number; juntadas: number }>;
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
    pedirReagendamento();
  },

  reavaliar: async () => {
    const repos = repositorios();
    const [pendentes, categorias, regras, contatos, movimentacoes, gastos, cartoes, preferencias] = await Promise.all([
      repo().listarPendentes(),
      repos.categorias.listarCategorias(),
      repos.regras.listarRegras(),
      repos.regras.listarContatos(),
      repos.movimentacoes.listarMovimentacoes(),
      repos.gastosRapidos.listarGastosRapidos(),
      repos.cartoes.listarCartoes(),
      repos.preferencias.buscarPreferencias(),
    ]);
    if (pendentes.length === 0) return { resolvidas: 0, juntadas: 0 };
    const categorizar = prepararCategorizador({
      categorias,
      regras,
      contatos,
      historico: historicoDeCategorias(movimentacoes, gastos),
      nomesProprios: lerNomesProprios(preferencias.nomesProprios),
    });
    const { respostas, juncoes } = reavaliarPerguntas(pendentes, categorizar);
    let resolvidas = 0;
    for (const { perguntaId, resposta } of respostas) {
      const pergunta = pendentes.find((p) => p.id === perguntaId);
      if (!pergunta) continue;
      try {
        const plano = planejarResposta(dadosDaPergunta(pergunta), resposta, { agora: new Date(), cartoes, gastos });
        await repo().responder(perguntaId, plano);
        resolvidas++;
      } catch {
        // fica na fila para você responder
      }
    }
    const resolvidasIds = new Set(respostas.map((r) => r.perguntaId));
    let juntadas = 0;
    for (const juncao of juncoes) {
      if (resolvidasIds.has(juncao.manterId)) continue;
      await repo().juntarPerguntas({ ...juncao, juntarIds: juncao.juntarIds.filter((id) => !resolvidasIds.has(id)) });
      juntadas += juncao.juntarIds.length;
    }
    if (resolvidas > 0 || juntadas > 0) {
      await get().carregar();
      pedirReagendamento();
    }
    return { resolvidas, juntadas };
  },
}));
