import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { membrosFamilia } from '@/data/db/schema';

type NovoMembro = { nome: string; cor: string; icone: string };

export async function listarMembrosFamilia() {
  return db.select().from(membrosFamilia).where(eq(membrosFamilia.ativo, true));
}

export async function criarMembroFamilia(dados: NovoMembro) {
  const [membro] = await db.insert(membrosFamilia).values(dados).returning();
  return membro;
}

export async function desativarMembroFamilia(id: number) {
  await db.update(membrosFamilia).set({ ativo: false }).where(eq(membrosFamilia.id, id));
}
