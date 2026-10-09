import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { contasBancarias } from '@/data/db/schema';
import type { NovaContaBancaria } from '@/domain/types/entities';

export async function listarContasBancarias() {
  return db.select().from(contasBancarias).where(eq(contasBancarias.ativo, true));
}

export async function buscarContaBancaria(id: number) {
  const [conta] = await db.select().from(contasBancarias).where(eq(contasBancarias.id, id));
  return conta ?? null;
}

export async function criarContaBancaria(dados: Omit<NovaContaBancaria, 'id' | 'ativo'>) {
  const [conta] = await db.insert(contasBancarias).values(dados).returning();
  return conta;
}

export async function atualizarContaBancaria(id: number, dados: Partial<NovaContaBancaria>) {
  const [conta] = await db
    .update(contasBancarias)
    .set(dados)
    .where(eq(contasBancarias.id, id))
    .returning();
  return conta;
}

export async function desativarContaBancaria(id: number) {
  await db.update(contasBancarias).set({ ativo: false }).where(eq(contasBancarias.id, id));
}
