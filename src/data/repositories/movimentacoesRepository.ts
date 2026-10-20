import type { MovimentacoesRepository, VinculoPagamento } from '@/domain/repositories/movimentacoesRepository';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { movimentacoes } from '@/data/db/schema';
import type { NovaMovimentacao } from '@/domain/types/entities';

export async function listarMovimentacoes() {
  return db.select().from(movimentacoes).orderBy(desc(movimentacoes.data));
}

export async function listarMovimentacoesPorConta(contaBancariaId: number) {
  return db
    .select()
    .from(movimentacoes)
    .where(eq(movimentacoes.contaBancariaId, contaBancariaId))
    .orderBy(desc(movimentacoes.data));
}

export async function buscarMovimentacao(id: number) {
  const [movimentacao] = await db.select().from(movimentacoes).where(eq(movimentacoes.id, id));
  return movimentacao ?? null;
}

export async function criarMovimentacao(dados: Omit<NovaMovimentacao, 'id'>) {
  const [movimentacao] = await db.insert(movimentacoes).values(dados).returning();
  return movimentacao;
}

export async function inserirMovimentacoes(dados: Omit<NovaMovimentacao, 'id'>[]) {
  if (dados.length === 0) return [];
  return db.insert(movimentacoes).values(dados).returning();
}

export async function atualizarMovimentacao(id: number, dados: Partial<Omit<NovaMovimentacao, 'id'>>) {
  const [movimentacao] = await db.update(movimentacoes).set(dados).where(eq(movimentacoes.id, id)).returning();
  return movimentacao;
}

export async function excluirMovimentacao(id: number) {
  await db.delete(movimentacoes).where(eq(movimentacoes.id, id));
}

export async function registrarPagamentoVinculado(vinculo: VinculoPagamento, dados: Omit<NovaMovimentacao, 'id'> | null) {
  const ligadaA =
    'faturaId' in vinculo ? eq(movimentacoes.faturaId, vinculo.faturaId) : eq(movimentacoes.parcelaId, vinculo.parcelaId);
  await db.delete(movimentacoes).where(ligadaA);
  if (dados === null) return;
  const ligacao = 'faturaId' in vinculo ? { faturaId: vinculo.faturaId, parcelaId: null } : { faturaId: null, parcelaId: vinculo.parcelaId };
  await db.insert(movimentacoes).values({ ...dados, ...ligacao });
}

export const movimentacoesRepositorySqlite: MovimentacoesRepository = {
  listarMovimentacoes,
  listarMovimentacoesPorConta,
  buscarMovimentacao,
  criarMovimentacao,
  inserirMovimentacoes,
  atualizarMovimentacao,
  excluirMovimentacao,
  registrarPagamentoVinculado,
};
