import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { cartoes } from '@/data/db/schema';
import type { NovoCartao } from '@/domain/types/entities';

export async function listarCartoes() {
  return db.select().from(cartoes).where(eq(cartoes.ativo, true));
}

export async function buscarCartao(id: number) {
  const [cartao] = await db.select().from(cartoes).where(eq(cartoes.id, id));
  return cartao ?? null;
}

export async function criarCartao(dados: Omit<NovoCartao, 'id' | 'ativo'>) {
  const [cartao] = await db.insert(cartoes).values(dados).returning();
  return cartao;
}

export async function atualizarCartao(id: number, dados: Partial<Omit<NovoCartao, 'id' | 'ativo'>>) {
  const [cartao] = await db.update(cartoes).set(dados).where(eq(cartoes.id, id)).returning();
  return cartao;
}

export async function desativarCartao(id: number) {
  await db.update(cartoes).set({ ativo: false }).where(eq(cartoes.id, id));
}
