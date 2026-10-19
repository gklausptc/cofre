import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { salvarBackupAutomatico } from '@/core/backup/arquivosBackup';
import { exportarTabelasDoBanco } from '@/data/backup/backupSqlite';
import { montarBackup } from '@/domain/usecases/backup';
import { db, sqlite } from './client';
import migrations from './migrations/migrations';
import { contarMigracoesPendentes, ultimaMigracaoAplicadaEm, versaoSchemaDoBanco } from './versaoBanco';

export const ERRO_BACKUP_ANTES_DA_ATUALIZACAO =
  'Não consegui guardar a cópia de segurança antes de atualizar o banco, então a atualização não foi feita. Seus dados continuam como estavam.';

async function executarPreparo(): Promise<void> {
  if ((await contarMigracoesPendentes(sqlite)) === 0) return;

  // Banco que já existia (não é instalação nova): copia tudo antes de migrar
  if ((await ultimaMigracaoAplicadaEm(sqlite)) !== null) {
    try {
      const agora = new Date();
      const backup = montarBackup(await exportarTabelasDoBanco(sqlite), await versaoSchemaDoBanco(sqlite), agora);
      salvarBackupAutomatico(backup, 'antes-da-atualizacao', agora);
    } catch {
      throw new Error(ERRO_BACKUP_ANTES_DA_ATUALIZACAO);
    }
  }

  // O Drizzle aplica todas as migrations pendentes numa única transação
  await migrate(db, migrations);
}

let preparo: Promise<void> | null = null;

/**
 * Deixa o banco pronto para uso: aplica as migrations pendentes, guardando antes uma cópia
 * automática dos dados (em documentDirectory/backups). Chamadas repetidas reaproveitam a
 * mesma execução; se falhar, a próxima chamada tenta de novo.
 */
export function prepararBanco(): Promise<void> {
  if (preparo === null) {
    preparo = executarPreparo().catch((erro: unknown) => {
      preparo = null;
      throw erro;
    });
  }
  return preparo;
}
