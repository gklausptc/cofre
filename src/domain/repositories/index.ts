import type { BackupRepository } from './backupRepository';

/**
 * Contratos de acesso a dados que a apresentação (telas, stores) e os serviços usam.
 * As implementações concretas (SQLite/Drizzle, em `src/data/`) são registradas uma vez,
 * na inicialização do app (`src/core/inicializacao/registrarRepositorios.ts`) — assim
 * ninguém fora dali precisa importar `src/data/`.
 */
export type Repositorios = {
  backup: BackupRepository;
};

let registrados: Repositorios | null = null;

export function registrarRepositorios(implementacoes: Repositorios): void {
  registrados = implementacoes;
}

export function repositorios(): Repositorios {
  if (registrados === null) {
    throw new Error('Repositórios não registrados: chame registrarRepositorios() na inicialização do app.');
  }
  return registrados;
}
