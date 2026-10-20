import type { CofrinhosRepository } from '@/domain/repositories/cofrinhosRepository';
import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { aportesCofrinho, cofrinhos } from '@/data/db/schema';
import type { NovoCofrinho } from '@/domain/types/entities';

export async function listarCofrinhos() {
  return db.select().from(cofrinhos);
}

export async function buscarCofrinho(id: number) {
  const [cofrinho] = await db.select().from(cofrinhos).where(eq(cofrinhos.id, id));
  return cofrinho ?? null;
}

export async function criarCofrinho(dados: Omit<NovoCofrinho, 'id' | 'status'>) {
  const [cofrinho] = await db.insert(cofrinhos).values({ ...dados, status: 'ativo' }).returning();
  return cofrinho;
}

export async function atualizarCofrinho(id: number, dados: Partial<Omit<NovoCofrinho, 'id' | 'status'>>) {
  const [cofrinho] = await db.update(cofrinhos).set(dados).where(eq(cofrinhos.id, id)).returning();
  return cofrinho;
}

export async function marcarCofrinhoConcluido(id: number) {
  await db.update(cofrinhos).set({ status: 'concluido' }).where(eq(cofrinhos.id, id));
}

export async function removerCofrinho(id: number) {
  // sem isso, os aportes ficam órfãos e continuam entrando na soma do dashboard
  // mesmo depois do cofrinho ser removido
  await db.delete(aportesCofrinho).where(eq(aportesCofrinho.cofrinhoId, id));
  await db.delete(cofrinhos).where(eq(cofrinhos.id, id));
}

export const cofrinhosRepositorySqlite: CofrinhosRepository = {
  listarCofrinhos,
  buscarCofrinho,
  criarCofrinho,
  atualizarCofrinho,
  marcarCofrinhoConcluido,
  removerCofrinho,
};
