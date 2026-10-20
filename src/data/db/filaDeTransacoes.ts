/**
 * Transações numa fila, uma de cada vez, na mesma conexão.
 *
 * Duas transações ao mesmo tempo (a importação gravando e a fila de perguntas limpando as
 * órfãs, por exemplo) quebravam assim: o BEGIN da segunda falhava, o ROLLBACK dela desfazia
 * a primeira pela metade, e o COMMIT/ROLLBACK da primeira estourava "cannot rollback - no
 * transaction is active". Na fila, a segunda espera a primeira terminar.
 *
 * Não aninhar: a tarefa de dentro esperaria a de fora, que espera a de dentro.
 */
export function criarFilaDeTransacoes(executar: (sql: string) => Promise<unknown>) {
  let fila: Promise<unknown> = Promise.resolve();

  async function rodar<T>(tarefa: () => Promise<T>): Promise<T> {
    await executar('BEGIN');
    try {
      const valor = await tarefa();
      await executar('COMMIT');
      return valor;
    } catch (erro) {
      // o SQLite pode já ter desfeito sozinho; aí o ROLLBACK falha e o erro que vale é o da tarefa
      try {
        await executar('ROLLBACK');
      } catch {
        // nada a desfazer
      }
      throw erro;
    }
  }

  return function emTransacao<T>(tarefa: () => Promise<T>): Promise<T> {
    const vez = fila.then(() => rodar(tarefa));
    fila = vez.catch(() => undefined);
    return vez;
  };
}
