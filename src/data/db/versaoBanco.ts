import type { SQLiteDatabase } from 'expo-sqlite';
import journal from './migrations/meta/_journal.json';

type Leitor = Pick<SQLiteDatabase, 'getAllAsync'>;

/**
 * `created_at` da última migration aplicada (o Drizzle grava ali o `when` do journal),
 * ou null se o banco ainda não passou por nenhuma — instalação nova.
 */
export async function ultimaMigracaoAplicadaEm(banco: Leitor): Promise<number | null> {
  const tabela = await banco.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
  );
  if (tabela.length === 0) return null;
  const [ultima] = await banco.getAllAsync<{ created_at: number | string | null }>(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'
  );
  if (!ultima || ultima.created_at === null) return null;
  return Number(ultima.created_at);
}

/** Índice (idx do journal) da última migration aplicada; -1 se nenhuma. */
export async function versaoSchemaDoBanco(banco: Leitor): Promise<number> {
  const aplicadaEm = await ultimaMigracaoAplicadaEm(banco);
  if (aplicadaEm === null) return -1;
  const aplicadas = journal.entries.filter((entrada) => entrada.when <= aplicadaEm);
  return aplicadas.length === 0 ? -1 : aplicadas[aplicadas.length - 1].idx;
}

/** Migrations do journal que o banco ainda não recebeu (mesma regra do migrator do Drizzle). */
export async function contarMigracoesPendentes(banco: Leitor): Promise<number> {
  const aplicadaEm = await ultimaMigracaoAplicadaEm(banco);
  return journal.entries.filter((entrada) => aplicadaEm === null || entrada.when > aplicadaEm).length;
}
