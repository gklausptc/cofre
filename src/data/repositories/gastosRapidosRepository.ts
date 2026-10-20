import type { GastosRapidosRepository } from '@/domain/repositories/gastosRapidosRepository';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { gastosRapidos } from '@/data/db/schema';
import type { NovoGastoRapido } from '@/domain/types/entities';

export async function listarGastosRapidos() {
  return db.select().from(gastosRapidos).orderBy(desc(gastosRapidos.data));
}

export async function buscarGastoRapido(id: number) {
  const [gasto] = await db.select().from(gastosRapidos).where(eq(gastosRapidos.id, id));
  return gasto ?? null;
}

export async function criarGastoRapido(dados: Omit<NovoGastoRapido, 'id'>) {
  const [gasto] = await db.insert(gastosRapidos).values(dados).returning();
  return gasto;
}

export async function atualizarGastoRapido(id: number, dados: Partial<Omit<NovoGastoRapido, 'id'>>) {
  const [gasto] = await db.update(gastosRapidos).set(dados).where(eq(gastosRapidos.id, id)).returning();
  return gasto;
}

export async function excluirGastoRapido(id: number) {
  await db.delete(gastosRapidos).where(eq(gastosRapidos.id, id));
}

/** Altera o valor de um gasto, guardando o valor de antes e o motivo. */
export async function ajustarValorGasto(id: number, novoValor: number, justificativa: string) {
  const gasto = await buscarGastoRapido(id);
  if (!gasto) throw new Error('Gasto não encontrado');
  await db
    .update(gastosRapidos)
    .set({
      valor: novoValor,
      valorOriginal: gasto.valorOriginal ?? gasto.valor,
      justificativaAlteracao: justificativa,
    })
    .where(eq(gastosRapidos.id, id));
}

export const gastosRapidosRepositorySqlite: GastosRapidosRepository = {
  listarGastosRapidos,
  buscarGastoRapido,
  criarGastoRapido,
  atualizarGastoRapido,
  excluirGastoRapido,
  ajustarValorGasto,
};
