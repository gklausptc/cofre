import type { CategoriasRepository, DadosCategoria } from '@/domain/repositories/categoriasRepository';
import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import {
  categorias,
  comprasParceladas,
  contasFixas,
  contatosPix,
  gastosRapidos,
  movimentacoes,
  orcamentos,
  regrasCategorizacao,
} from '@/data/db/schema';
import { seedCategoriasPadrao } from '@/data/db/seed';
import { emTransacao } from '@/data/db/transacao';

export async function listarCategorias() {
  return db.select().from(categorias);
}

export async function garantirCategoriasPadrao() {
  await seedCategoriasPadrao(db);
}

export async function criarCategoria(dados: DadosCategoria) {
  const [criada] = await db.insert(categorias).values(dados).returning();
  return criada;
}

export async function atualizarCategoria(id: number, dados: Partial<DadosCategoria>) {
  await db.update(categorias).set(dados).where(eq(categorias.id, id));
}

export async function juntarCategorias(origemId: number, destinoId: number) {
  if (origemId === destinoId) return;
  await emTransacao(async () => {
    await db.update(movimentacoes).set({ categoriaId: destinoId }).where(eq(movimentacoes.categoriaId, origemId));
    await db.update(gastosRapidos).set({ categoriaId: destinoId }).where(eq(gastosRapidos.categoriaId, origemId));
    await db.update(contasFixas).set({ categoriaId: destinoId }).where(eq(contasFixas.categoriaId, origemId));
    await db.update(comprasParceladas).set({ categoriaId: destinoId }).where(eq(comprasParceladas.categoriaId, origemId));
    await db.update(regrasCategorizacao).set({ categoriaId: destinoId }).where(eq(regrasCategorizacao.categoriaId, origemId));
    await db.update(contatosPix).set({ categoriaId: destinoId }).where(eq(contatosPix.categoriaId, origemId));
    // orçamento: fica o do destino; se ele não tinha, o da origem passa para ele
    const doDestino = await db.select().from(orcamentos).where(eq(orcamentos.categoriaId, destinoId));
    if (doDestino.length > 0) await db.delete(orcamentos).where(eq(orcamentos.categoriaId, origemId));
    else await db.update(orcamentos).set({ categoriaId: destinoId }).where(eq(orcamentos.categoriaId, origemId));
    await db.delete(categorias).where(eq(categorias.id, origemId));
  });
}

export const categoriasRepositorySqlite: CategoriasRepository = {
  listarCategorias,
  garantirCategoriasPadrao,
  criarCategoria,
  atualizarCategoria,
  juntarCategorias,
};
