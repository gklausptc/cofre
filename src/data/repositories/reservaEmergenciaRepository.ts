import type { ReservaEmergenciaRepository } from '@/domain/repositories/reservaEmergenciaRepository';
import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { movimentacoesReserva, reservaEmergencia } from '@/data/db/schema';
import { calcularValorReserva } from '@/domain/usecases/saldoReserva';
import { formatarMoeda } from '@/core/utils/currency';
import { listarMovimentacoesReserva, registrarMovimentacaoReserva } from './movimentacoesReservaRepository';

export async function buscarReservaEmergencia() {
  const [reserva] = await db.select().from(reservaEmergencia).where(eq(reservaEmergencia.id, 1));
  return reserva ?? null;
}

export async function definirMetaReserva(valorMeta: number, mesesCoberturaDesejados: number | null) {
  const existente = await buscarReservaEmergencia();
  if (existente) {
    const [reserva] = await db
      .update(reservaEmergencia)
      .set({ valorMeta, mesesCoberturaDesejados })
      .where(eq(reservaEmergencia.id, 1))
      .returning();
    return reserva;
  }
  const [reserva] = await db.insert(reservaEmergencia).values({ id: 1, valorMeta, mesesCoberturaDesejados }).returning();
  return reserva;
}

export async function aportarReserva(valor: number) {
  const atual = await buscarReservaEmergencia();
  if (!atual) throw new Error('Reserva de emergência ainda não configurada');
  await registrarMovimentacaoReserva('aporte', valor, null);
}

/** O valor guardado é aportes − retiradas: não dá para retirar mais do que isso. */
export async function retirarReserva(valor: number, justificativa: string) {
  const atual = await buscarReservaEmergencia();
  if (!atual) throw new Error('Reserva de emergência ainda não configurada');
  const guardado = calcularValorReserva(await listarMovimentacoesReserva());
  if (valor > guardado) {
    throw new Error(`A retirada é maior que o valor guardado na reserva (${formatarMoeda(guardado)}).`);
  }
  await registrarMovimentacaoReserva('retirada', valor, justificativa);
}

export async function removerReservaEmergencia() {
  // "remover" é um reset completo — limpa o histórico de aportes/retiradas junto,
  // pra "Definir meta" começar do zero de verdade
  await db.delete(movimentacoesReserva);
  await db.delete(reservaEmergencia).where(eq(reservaEmergencia.id, 1));
}

export const reservaEmergenciaRepositorySqlite: ReservaEmergenciaRepository = {
  buscarReservaEmergencia,
  definirMetaReserva,
  aportarReserva,
  retirarReserva,
  removerReservaEmergencia,
};
