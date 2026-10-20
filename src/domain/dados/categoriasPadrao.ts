/**
 * Categorias criadas pelo app (o dicionário de comerciantes e as palavras-chave usam estes
 * nomes). A `versao` diz em que leva a categoria entrou: quem já usava o app recebe só as
 * novas, uma vez (ver `seedCategoriasPadrao`), e as que a pessoa apagar depois não voltam.
 * `refina` é a categoria mais geral que ela detalha: se a pessoa juntou ou apagou "Mercado",
 * o que seria Mercado vai para Alimentação.
 */
export type CategoriaPadrao = {
  nome: string;
  icone: string;
  cor: string;
  tipo: 'receita' | 'despesa';
  versao?: number;
  refina?: string;
};

export const VERSAO_CATEGORIAS_PADRAO = 2;

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
  // ---- leva 2 (out/2026): mais detalhe no que mais aparece nos extratos
  { nome: 'Mercado', icone: 'shopping-cart', cor: '#2E7D32', tipo: 'despesa', versao: 2, refina: 'Alimentação' },
  { nome: 'Delivery', icone: 'truck', cor: '#E65100', tipo: 'despesa', versao: 2, refina: 'Alimentação' },
  { nome: 'Combustível', icone: 'droplet', cor: '#455A64', tipo: 'despesa', versao: 2, refina: 'Transporte' },
  { nome: 'Estacionamento e pedágio', icone: 'map-pin', cor: '#5D4037', tipo: 'despesa', versao: 2, refina: 'Transporte' },
  { nome: 'Veículo', icone: 'tool', cor: '#37474F', tipo: 'despesa', versao: 2, refina: 'Transporte' },
  { nome: 'Compras online', icone: 'package', cor: '#AD1457', tipo: 'despesa', versao: 2, refina: 'Compras' },
  { nome: 'Farmácia', icone: 'plus-square', cor: '#00838F', tipo: 'despesa', versao: 2, refina: 'Saúde' },
  { nome: 'Saque em dinheiro', icone: 'dollar-sign', cor: '#795548', tipo: 'despesa', versao: 2, refina: 'Outros gastos' },
  { nome: 'Tarifas e juros', icone: 'percent', cor: '#B71C1C', tipo: 'despesa', versao: 2, refina: 'Outros gastos' },
  { nome: 'Não identificado', icone: 'help-circle', cor: '#8891A6', tipo: 'despesa', versao: 2, refina: 'Outros gastos' },
  { nome: 'Rendimentos', icone: 'trending-up', cor: '#0277BD', tipo: 'receita', versao: 2, refina: 'Outras receitas' },
  { nome: 'Reembolsos e estornos', icone: 'rotate-ccw', cor: '#00897B', tipo: 'receita', versao: 2, refina: 'Outras receitas' },
  { nome: 'Não identificado', icone: 'help-circle', cor: '#8891A6', tipo: 'receita', versao: 2, refina: 'Outras receitas' },
];

/** Nome da categoria para "não sei o que é" (existe para despesa e para receita). */
export const NAO_IDENTIFICADO = 'Não identificado';

/** Categoria mais geral que `nome` detalha (Mercado → Alimentação), ou null. */
export function categoriaMaisGeral(nome: string, tipo: 'receita' | 'despesa'): string | null {
  return CATEGORIAS_PADRAO.find((c) => c.nome === nome && c.tipo === tipo)?.refina ?? null;
}

/** Cores para categorias novas criadas pelo usuário (contraste com o texto branco). */
export const CORES_DE_CATEGORIA = [
  '#2A5CE0', '#2E7D32', '#E65100', '#AD1457', '#00838F', '#6A1B9A', '#C62828', '#5D4037', '#455A64', '#F9A825', '#0277BD', '#558B2F',
];
