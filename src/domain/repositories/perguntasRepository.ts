import type { PerguntaPendente } from '@/domain/types/entities';
import type { PlanoDeResposta } from '@/domain/usecases/importacao/responderPergunta';

export interface PerguntasRepository {
  /** Pendentes, da de maior impacto para a de menor. */
  listarPendentes(): Promise<PerguntaPendente[]>;
  /** Aplica o plano da resposta numa transação e marca a pergunta como respondida. */
  responder(perguntaId: number, plano: PlanoDeResposta): Promise<void>;
}
