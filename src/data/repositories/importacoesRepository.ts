import type { ImportacoesRepository, RegistroDeImportacao } from '@/domain/repositories/importacoesRepository';
import { desc } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { gastosRapidos, importacoes, movimentacoes } from '@/data/db/schema';
import { emTransacao } from '@/data/db/transacao';

export async function listarImportacoes() {
  return db.select().from(importacoes).orderBy(desc(importacoes.criadaEm));
}

export async function registrarImportacao(registro: RegistroDeImportacao): Promise<number> {
  return emTransacao(async () => {
    const [importacao] = await db.insert(importacoes).values(registro.importacao).returning();
    const ligadas = { importacaoId: importacao.id };
    if (registro.movimentacoes.length > 0) {
      await db.insert(movimentacoes).values(registro.movimentacoes.map((m) => ({ ...m, ...ligadas })));
    }
    if (registro.gastos.length > 0) {
      await db.insert(gastosRapidos).values(registro.gastos.map((g) => ({ ...g, ...ligadas })));
    }
    return importacao.id;
  });
}

export const importacoesRepositorySqlite: ImportacoesRepository = {
  listarImportacoes,
  registrarImportacao,
};
