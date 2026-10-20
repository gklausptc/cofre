import type { PerguntaPendente } from '@/domain/types/entities';
import type { PlanoDeResposta } from '@/domain/usecases/importacao/responderPergunta';
import type { JuncaoDePerguntas } from '@/domain/usecases/importacao/reavaliarPerguntas';

export interface PerguntasRepository {
  /** Pendentes, da de maior impacto para a de menor. */
  listarPendentes(): Promise<PerguntaPendente[]>;
  /** Aplica o plano da resposta numa transação e marca a pergunta como respondida. */
  responder(perguntaId: number, plano: PlanoDeResposta): Promise<void>;
  /** Junta perguntas que agora têm a mesma chave (fica `manterId`, com as linhas de todas). */
  juntarPerguntas(juncao: JuncaoDePerguntas): Promise<void>;
  /**
   * Tira da fila as perguntas cujos lançamentos não existem mais (dados apagados, importação
   * desfeita, lançamento excluído) e as linhas que sumiram das que ficam. Devolve quantas saíram.
   */
  limparOrfas(): Promise<number>;
}
