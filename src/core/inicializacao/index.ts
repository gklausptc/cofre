/**
 * Raiz de composição do app: o único lugar fora de `src/data/` que conhece as
 * implementações concretas. As telas chamam `inicializarRepositorios()` uma vez (no
 * `app/_layout.tsx`) e depois só falam com as interfaces de `src/domain/repositories`.
 */
import { backupRepositorySqlite } from '@/data/backup/backupSqlite';
import { registrarRepositorios } from '@/domain/repositories';

export { prepararBanco } from '@/data/db/prepararBanco';

export function inicializarRepositorios(): void {
  registrarRepositorios({
    backup: backupRepositorySqlite,
  });
}
