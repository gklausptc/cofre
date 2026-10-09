import { categorias } from './schema';
import type { Database } from './client';

type CategoriaSeed = {
  nome: string;
  icone: string;
  cor: string;
  tipo: 'receita' | 'despesa';
};

const CATEGORIAS_PADRAO: CategoriaSeed[] = [
  { nome: 'Alimentação', icone: 'utensils', cor: '#D97706', tipo: 'despesa' },
  { nome: 'Transporte', icone: 'car', cor: '#2D6A4F', tipo: 'despesa' },
  { nome: 'Moradia', icone: 'home', cor: '#40916C', tipo: 'despesa' },
  { nome: 'Lazer', icone: 'film', cor: '#C1443C', tipo: 'despesa' },
  { nome: 'Saúde', icone: 'heart-pulse', cor: '#1B4332', tipo: 'despesa' },
  { nome: 'Educação', icone: 'book-open', cor: '#6B6F68', tipo: 'despesa' },
  { nome: 'Compras', icone: 'shopping-bag', cor: '#D97706', tipo: 'despesa' },
  { nome: 'Assinaturas', icone: 'repeat', cor: '#40916C', tipo: 'despesa' },
  { nome: 'Outros gastos', icone: 'more-horizontal', cor: '#6B6F68', tipo: 'despesa' },
  { nome: 'Salário', icone: 'briefcase', cor: '#2D6A4F', tipo: 'receita' },
  { nome: 'Freelance', icone: 'laptop', cor: '#40916C', tipo: 'receita' },
  { nome: 'Outras receitas', icone: 'plus-circle', cor: '#1B4332', tipo: 'receita' },
];

export async function seedCategoriasPadrao(db: Database) {
  const existentes = await db.select().from(categorias).limit(1);
  if (existentes.length > 0) return;

  await db.insert(categorias).values(
    CATEGORIAS_PADRAO.map((categoria) => ({ ...categoria, isPadrao: true }))
  );
}
