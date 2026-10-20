import { limparTodosOsDados } from '@/data/db/resetDatabase';
import { emTransacao } from '@/data/db/transacao';
import type { ManutencaoRepository } from '@/domain/repositories/manutencaoRepository';

export const manutencaoRepositorySqlite: ManutencaoRepository = {
  limparTodosOsDados: () => emTransacao(limparTodosOsDados),
  emTransacao,
};
