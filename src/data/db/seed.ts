import { eq } from 'drizzle-orm';
import { categorias, preferencias } from './schema';
import type { Database } from './client';
import { CATEGORIAS_PADRAO, VERSAO_CATEGORIAS_PADRAO } from '@/domain/dados/categoriasPadrao';
import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';

/**
 * Banco vazio: cria todas as categorias padrão. Banco de uma versão anterior: acrescenta só
 * as das levas novas que ainda não existem (pelo nome), uma vez — as que a pessoa apagar ou
 * juntar depois não voltam.
 */
export async function seedCategoriasPadrao(db: Database) {
  const existentes = await db.select().from(categorias);
  const [pref] = await db.select().from(preferencias).where(eq(preferencias.id, 1));
  const aplicada = existentes.length === 0 ? 0 : (pref?.categoriasPadraoVersao ?? 1);
  if (aplicada >= VERSAO_CATEGORIAS_PADRAO) return;

  const chave = (c: { nome: string; tipo: string }) => `${c.tipo}|${semAcentos(c.nome)}`;
  const jaTem = new Set(existentes.map(chave));
  const novas = CATEGORIAS_PADRAO.filter((c) => (c.versao ?? 1) > aplicada && !jaTem.has(chave(c)));
  if (novas.length > 0) {
    await db.insert(categorias).values(novas.map(({ versao: _versao, refina: _refina, ...categoria }) => ({ ...categoria, isPadrao: true })));
  }
  if (pref) await db.update(preferencias).set({ categoriasPadraoVersao: VERSAO_CATEGORIAS_PADRAO }).where(eq(preferencias.id, 1));
}
