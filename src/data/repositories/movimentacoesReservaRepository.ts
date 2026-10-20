import type { MovimentacoesReservaRepository } from '@/domain/repositories/movimentacoesReservaRepository';
import { desc } from 'drizzle-orm';
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

export const movimentacoesReservaRepositorySqlite: MovimentacoesReservaRepository = {
  listarMovimentacoesReserva,
};
