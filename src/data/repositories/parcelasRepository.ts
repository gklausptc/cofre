import { eq, inArray } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { parcelas } from '@/data/db/schema';
import type { NovaParcela } from '@/domain/types/entities';

export async function listarParcelas() {
  return db.select().from(parcelas);
}

export async function listarParcelasPorContaFixa(contaFixaId: number) {
  return db.select().from(parcelas).where(eq(parcelas.contaFixaId, contaFixaId));
}

export async function listarParcelasPorCompra(compraParceladaId: number) {
  return db.select().from(parcelas).where(eq(parcelas.compraParceladaId, compraParceladaId));
}

export async function inserirParcelas(dados: Omit<NovaParcela, 'id'>[]) {
  if (dados.length === 0) return [];
  return db.insert(parcelas).values(dados).returning();
}

export async function marcarParcelaPaga(id: number, dataPagamento: string) {
  await db.update(parcelas).set({ status: 'paga', dataPagamento }).where(eq(parcelas.id, id));
}

export async function marcarParcelasPagas(ids: number[], dataPagamento: string) {
  if (ids.length === 0) return;
  await db.update(parcelas).set({ status: 'paga', dataPagamento }).where(inArray(parcelas.id, ids));
}

/** Altera o valor de uma parcela pendente, guardando o valor de antes e o motivo. */
export async function ajustarValorParcela(id: number, novoValor: number, justificativa: string) {
  const [atual] = await db.select().from(parcelas).where(eq(parcelas.id, id));
  if (!atual) throw new Error('Parcela não encontrada');
  if (atual.status === 'paga') throw new Error('Parcela já paga não pode ser alterada');
  await db
    .update(parcelas)
    .set({
      valor: novoValor,
      valorOriginal: atual.valorOriginal ?? atual.valor,
      justificativaAlteracao: justificativa,
    })
    .where(eq(parcelas.id, id));
}
