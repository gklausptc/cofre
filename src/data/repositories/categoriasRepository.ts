import type { CategoriasRepository } from '@/domain/repositories/categoriasRepository';
import { db } from '@/data/db/client';
import { categorias } from '@/data/db/schema';
import { seedCategoriasPadrao } from '@/data/db/seed';

export async function listarCategorias() {
  return db.select().from(categorias);
}

export async function garantirCategoriasPadrao() {
  await seedCategoriasPadrao(db);
}

export const categoriasRepositorySqlite: CategoriasRepository = {
  listarCategorias,
  garantirCategoriasPadrao,
};
