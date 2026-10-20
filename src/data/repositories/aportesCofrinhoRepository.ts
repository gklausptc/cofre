import type { AportesCofrinhoRepository } from '@/domain/repositories/aportesCofrinhoRepository';
import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { aportesCofrinho } from '@/data/db/schema';

export async function listarAportes() {
  return db.select().from(aportesCofrinho);
}

export async function listarAportesPorCofrinho(cofrinhoId: number) {
  return db.select().from(aportesCofrinho).where(eq(aportesCofrinho.cofrinhoId, cofrinhoId));
}

export async function criarAporte(cofrinhoId: number, valor: number, data: string) {
  const [aporte] = await db.insert(aportesCofrinho).values({ cofrinhoId, valor, data }).returning();
  return aporte;
}

export const aportesCofrinhoRepositorySqlite: AportesCofrinhoRepository = {
  listarAportes,
  listarAportesPorCofrinho,
  criarAporte,
};
