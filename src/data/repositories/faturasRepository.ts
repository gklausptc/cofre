import type { FaturasRepository, PagamentoFatura } from '@/domain/repositories/faturasRepository';
import { and, eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { faturas } from '@/data/db/schema';

export async function listarFaturas() {
  return db.select().from(faturas);
}

/** Registra (ou atualiza) a fatura do cartão/mês como paga e devolve o id dela. */
export async function registrarPagamentoFatura(dados: PagamentoFatura): Promise<number> {
  const [existente] = await db
    .select()
    .from(faturas)
    .where(and(eq(faturas.cartaoId, dados.cartaoId), eq(faturas.mesReferencia, dados.mesReferencia)));

  const campos = {
    status: 'paga' as const,
    contaBancariaId: dados.contaBancariaId,
    valorPago: dados.valorPago,
    dataPagamento: dados.dataPagamento,
  };

  if (existente) {
    await db.update(faturas).set(campos).where(eq(faturas.id, existente.id));
    return existente.id;
  }
  const [criada] = await db
    .insert(faturas)
    .values({
      cartaoId: dados.cartaoId,
      mesReferencia: dados.mesReferencia,
      dataFechamento: dados.dataFechamento,
      dataVencimento: dados.dataVencimento,
      ...campos,
    })
    .returning();
  return criada.id;
}

export const faturasRepositorySqlite: FaturasRepository = {
  listarFaturas,
  registrarPagamentoFatura,
};
