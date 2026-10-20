/** Categorias criadas na primeira abertura do app (o dicionário de comerciantes usa estes nomes). */
export type CategoriaPadrao = {
  nome: string;
  icone: string;
  cor: string;
  tipo: 'receita' | 'despesa';
};

export const CATEGORIAS_PADRAO: CategoriaPadrao[] = [
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
