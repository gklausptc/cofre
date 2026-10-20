import { describe, expect, it } from '@jest/globals';
import { criarFilaDeTransacoes } from '@/data/db/filaDeTransacoes';

/** Conexão de mentira: guarda os comandos e recusa BEGIN dentro de transação, como o SQLite. */
function conexao(opcoes: { rollbackFalha?: boolean } = {}) {
  const log: string[] = [];
  let ativa = false;
  const executar = async (sql: string) => {
    log.push(sql);
    if (sql === 'BEGIN') {
      if (ativa) throw new Error('cannot start a transaction within a transaction');
      ativa = true;
    } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
      if (!ativa || (sql === 'ROLLBACK' && opcoes.rollbackFalha)) throw new Error(`cannot ${sql.toLowerCase()} - no transaction is active`);
      ativa = false;
    }
  };
  return { log, emTransacao: criarFilaDeTransacoes(executar) };
}

const esperar = () => new Promise((resolver) => setTimeout(resolver, 5));

describe('criarFilaDeTransacoes', () => {
  it('duas transações ao mesmo tempo rodam uma depois da outra', async () => {
    const { log, emTransacao } = conexao();
    const primeira = emTransacao(async () => {
      await esperar();
      log.push('grava 1');
      return 1;
    });
    const segunda = emTransacao(async () => {
      log.push('grava 2');
      return 2;
    });
    await expect(Promise.all([primeira, segunda])).resolves.toEqual([1, 2]);
    expect(log).toEqual(['BEGIN', 'grava 1', 'COMMIT', 'BEGIN', 'grava 2', 'COMMIT']);
  });

  it('a que falha desfaz só a si mesma e a fila continua', async () => {
    const { log, emTransacao } = conexao();
    const falha = emTransacao(async () => {
      log.push('grava 1');
      throw new Error('erro da tarefa');
    });
    const depois = emTransacao(async () => 'ok');
    await expect(falha).rejects.toThrow('erro da tarefa');
    await expect(depois).resolves.toBe('ok');
    expect(log).toEqual(['BEGIN', 'grava 1', 'ROLLBACK', 'BEGIN', 'COMMIT']);
  });

  it('se o ROLLBACK falha, o erro que aparece é o da tarefa', async () => {
    const { emTransacao } = conexao({ rollbackFalha: true });
    await expect(
      emTransacao(async () => {
        throw new Error('erro de verdade');
      })
    ).rejects.toThrow('erro de verdade');
  });
});
