import type { LinhaBackup, TabelasBackup } from '@/domain/usecases/backup';

export interface BackupRepository {
  /** Índice da última migration aplicada no banco (0000 = 0); -1 se o banco ainda não foi criado. */
  versaoSchemaAtual(): Promise<number>;
  /** Todas as tabelas de dados do app, linha a linha, como estão gravadas. */
  exportarTabelas(): Promise<TabelasBackup>;
  /** Linha singleton de `preferencias` como está gravada, ou null se ainda não existe. */
  lerPreferenciasGravadas(): Promise<LinhaBackup | null>;
  /** Apaga os dados de todas as tabelas e grava as do backup, tudo numa única transação. */
  substituirTabelas(tabelas: TabelasBackup): Promise<void>;
  registrarUltimoBackup(dataHoraIso: string): Promise<void>;
}
