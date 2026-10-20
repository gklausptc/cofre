import { sqlite } from './client';

/**
 * Executa a tarefa numa transação do SQLite: ou tudo o que ela grava fica, ou nada fica.
 * As consultas do Drizzle no Expo rodam de forma síncrona na mesma conexão, então entram
 * na transação. Não aninhar: BEGIN dentro de outra transação falha.
 */
export async function emTransacao<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado: { valor?: T } = {};
  await sqlite.withTransactionAsync(async () => {
    resultado.valor = await tarefa();
  });
  return resultado.valor as T;
}
