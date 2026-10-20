import type { MembrosFamiliaRepository, DadosMembroFamilia } from '@/domain/repositories/membrosFamiliaRepository';
import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { membrosFamilia } from '@/data/db/schema';

export async function listarMembrosFamilia() {
  return db.select().from(membrosFamilia).where(eq(membrosFamilia.ativo, true));
}

export async function criarMembroFamilia(dados: DadosMembroFamilia) {
  const [membro] = await db.insert(membrosFamilia).values(dados).returning();
  return membro;
}

export async function desativarMembroFamilia(id: number) {
  await db.update(membrosFamilia).set({ ativo: false }).where(eq(membrosFamilia.id, id));
}

export const membrosFamiliaRepositorySqlite: MembrosFamiliaRepository = {
  listarMembrosFamilia,
  criarMembroFamilia,
  desativarMembroFamilia,
};
