import type { ContasFixasRepository } from '@/domain/repositories/contasFixasRepository';
import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { contasFixas } from '@/data/db/schema';
import type { NovaContaFixa } from '@/domain/types/entities';

export async function listarContasFixas() {
  return db.select().from(contasFixas).where(eq(contasFixas.ativo, true));
}

export async function listarTodasContasFixas() {
  return db.select().from(contasFixas);
}

export async function buscarContaFixa(id: number) {
  const [conta] = await db.select().from(contasFixas).where(eq(contasFixas.id, id));
  return conta ?? null;
}

export async function criarContaFixa(dados: Omit<NovaContaFixa, 'id' | 'ativo'>) {
  const [conta] = await db.insert(contasFixas).values(dados).returning();
  return conta;
}

export async function atualizarContaFixa(id: number, dados: Partial<NovaContaFixa>) {
  const [conta] = await db.update(contasFixas).set(dados).where(eq(contasFixas.id, id)).returning();
  return conta;
}

export async function desativarContaFixa(id: number) {
  await db.update(contasFixas).set({ ativo: false }).where(eq(contasFixas.id, id));
}

export const contasFixasRepositorySqlite: ContasFixasRepository = {
  listarContasFixas,
  listarTodasContasFixas,
  buscarContaFixa,
  criarContaFixa,
  atualizarContaFixa,
  desativarContaFixa,
};
