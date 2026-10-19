import type { SQLiteDatabase } from 'expo-sqlite';
import { sqlite } from '@/data/db/client';
import { versaoSchemaDoBanco } from '@/data/db/versaoBanco';
import { atualizarPreferencias } from '@/data/repositories/preferenciasRepository';
import type { BackupRepository } from '@/domain/repositories/backupRepository';
import type { LinhaBackup, TabelasBackup } from '@/domain/usecases/backup';

/** Tabelas internas do SQLite e do Drizzle, que não são dados do usuário. */
const TABELAS_FORA_DO_BACKUP = new Set(['sqlite_sequence', '__drizzle_migrations', 'android_metadata']);

type Leitor = Pick<SQLiteDatabase, 'getAllAsync'>;

function citar(identificador: string): string {
  return `"${identificador.replace(/"/g, '""')}"`;
}

async function listarTabelasDeDados(banco: Leitor): Promise<string[]> {
  const linhas = await banco.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return linhas.map((linha) => linha.name).filter((nome) => !TABELAS_FORA_DO_BACKUP.has(nome));
}

async function listarColunas(banco: Leitor, tabela: string): Promise<Set<string>> {
  const colunas = await banco.getAllAsync<{ name: string }>(`PRAGMA table_info(${citar(tabela)})`);
  return new Set(colunas.map((coluna) => coluna.name));
}

/** O schema do app só tem texto, inteiro e real; qualquer outra coisa indica banco corrompido. */
function paraLinhaBackup(tabela: string, linha: Record<string, unknown>): LinhaBackup {
  const convertida: LinhaBackup = {};
  for (const [coluna, valor] of Object.entries(linha)) {
    if (valor === null || typeof valor === 'string' || typeof valor === 'number') {
      convertida[coluna] = valor;
    } else {
      throw new Error(`Valor inesperado em ${tabela}.${coluna}`);
    }
  }
  return convertida;
}

/**
 * Lê todas as tabelas direto do SQLite, sem passar pelo schema do Drizzle: funciona com
 * o banco em qualquer versão (inclusive antes de uma migration pendente).
 */
export async function exportarTabelasDoBanco(banco: Leitor = sqlite): Promise<TabelasBackup> {
  const tabelas: TabelasBackup = {};
  for (const tabela of await listarTabelasDeDados(banco)) {
    const linhas = await banco.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${citar(tabela)} ORDER BY rowid`);
    tabelas[tabela] = linhas.map((linha) => paraLinhaBackup(tabela, linha));
  }
  return tabelas;
}

async function substituirTabelas(tabelas: TabelasBackup): Promise<void> {
  await sqlite.withExclusiveTransactionAsync(async (txn) => {
    const existentes = await listarTabelasDeDados(txn);

    for (const tabela of existentes) {
      await txn.runAsync(`DELETE FROM ${citar(tabela)}`);
    }

    for (const tabela of existentes) {
      const linhas = tabelas[tabela] ?? [];
      if (linhas.length === 0) continue;

      // Só as colunas que existem hoje: coluna que o backup não tem fica com o valor padrão
      const colunasAtuais = await listarColunas(txn, tabela);
      const colunasDoBackup = new Set(linhas.flatMap((linha) => Object.keys(linha)));
      const colunas = [...colunasDoBackup].filter((coluna) => colunasAtuais.has(coluna));
      if (colunas.length === 0) continue;

      const comando = await txn.prepareAsync(
        `INSERT INTO ${citar(tabela)} (${colunas.map(citar).join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`
      );
      try {
        for (const linha of linhas) {
          await comando.executeAsync(colunas.map((coluna) => linha[coluna] ?? null));
        }
      } finally {
        await comando.finalizeAsync();
      }
    }
  });
}

export const backupRepositorySqlite: BackupRepository = {
  versaoSchemaAtual: () => versaoSchemaDoBanco(sqlite),
  exportarTabelas: () => exportarTabelasDoBanco(sqlite),
  async lerPreferenciasGravadas() {
    const [linha] = await sqlite.getAllAsync<Record<string, unknown>>('SELECT * FROM preferencias WHERE id = 1');
    return linha ? paraLinhaBackup('preferencias', linha) : null;
  },
  substituirTabelas,
  async registrarUltimoBackup(dataHoraIso) {
    await atualizarPreferencias({ ultimoBackupEm: dataHoraIso });
  },
};
