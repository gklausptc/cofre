import { sqlite } from './client';
import { criarFilaDeTransacoes } from './filaDeTransacoes';

/**
 * Executa a tarefa numa transação do SQLite: ou tudo o que ela grava fica, ou nada fica.
 * As consultas do Drizzle no Expo rodam de forma síncrona na mesma conexão, então entram
 * na transação. As transações esperam a vez numa fila (`filaDeTransacoes.ts`); não aninhar.
 */
export const emTransacao = criarFilaDeTransacoes((sql) => sqlite.execAsync(sql));
