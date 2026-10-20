import type { MovimentacoesReservaRepository } from '@/domain/repositories/movimentacoesReservaRepository';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { movimentacoesReserva } from '@/data/db/schema';
import type { MovimentacaoReserva } from '@/domain/types/entities';
import { hojeIso } from '@/core/utils/date';

export async function listarMovimentacoesReserva() {
  return db.select().from(movimentacoesReserva).orderBy(desc(movimentacoesReserva.data));
}

export async function registrarMovimentacaoReserva(
  tipo: MovimentacaoReserva['tipo'],
  valor: number,
  justificativa: string | null
) {
  await db.insert(movimentacoesReserva).values({
    tipo,
    valor,
    data: hojeIso(),
    justificativa,
  });
}

export async function registrarAporte(valor: number, data: string): Promise<number> {
  const [criado] = await db.insert(movimentacoesReserva).values({ tipo: 'aporte', valor, data, justificativa: null }).returning();
  return criado.id;
}

export async function excluirMovimentacaoReserva(id: number) {
  await db.delete(movimentacoesReserva).where(eq(movimentacoesReserva.id, id));
}

export const movimentacoesReservaRepositorySqlite: MovimentacoesReservaRepository = {
  listarMovimentacoesReserva,
  registrarAporte,
  excluirMovimentacaoReserva,
};
