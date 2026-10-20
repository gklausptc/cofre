import { categorias } from './schema';
import type { Database } from './client';
import { CATEGORIAS_PADRAO } from '@/domain/dados/categoriasPadrao';

export async function seedCategoriasPadrao(db: Database) {
  const existentes = await db.select().from(categorias).limit(1);
  if (existentes.length > 0) return;

  await db.insert(categorias).values(
    CATEGORIAS_PADRAO.map((categoria) => ({ ...categoria, isPadrao: true }))
  );
}
