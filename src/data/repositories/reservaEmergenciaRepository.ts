import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { movimentacoesReserva, reservaEmergencia } from '@/data/db/schema';
import { registrarMovimentacaoReserva } from './movimentacoesReservaRepository';

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
  const [reserva] = await db
    .insert(reservaEmergencia)
    .values({ id: 1, valorMeta, valorAtual: 0, mesesCoberturaDesejados })
    .returning();
  return reserva;
}

export async function aportarReserva(valor: number) {
  const atual = await buscarReservaEmergencia();
  if (!atual) throw new Error('Reserva de emergência ainda não configurada');
  await db
    .update(reservaEmergencia)
    .set({ valorAtual: atual.valorAtual + valor })
    .where(eq(reservaEmergencia.id, 1));
  await registrarMovimentacaoReserva('aporte', valor, null);
}

export async function retirarReserva(valor: number, justificativa: string) {
  const atual = await buscarReservaEmergencia();
  if (!atual) throw new Error('Reserva de emergência ainda não configurada');
  const novoValor = Math.max(0, atual.valorAtual - valor);
  await db.update(reservaEmergencia).set({ valorAtual: novoValor }).where(eq(reservaEmergencia.id, 1));
  await registrarMovimentacaoReserva('retirada', valor, justificativa);
}

export async function removerReservaEmergencia() {
  // "remover" é um reset completo — limpa o histórico de aportes/retiradas junto,
  // pra "Definir meta" começar do zero de verdade
  await db.delete(movimentacoesReserva);
  await db.delete(reservaEmergencia).where(eq(reservaEmergencia.id, 1));
}
