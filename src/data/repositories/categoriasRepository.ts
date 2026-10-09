import { db } from '@/data/db/client';
import { categorias } from '@/data/db/schema';

export async function listarCategorias() {
  return db.select().from(categorias);
}
