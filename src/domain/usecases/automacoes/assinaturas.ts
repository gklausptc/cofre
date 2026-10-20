import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import { semelhanca } from '@/domain/usecases/importacao/deduplicar';
import { textoParaRegra } from '@/domain/usecases/importacao/categorizar';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { Categoria, ContaFixa } from '@/domain/types/entities';

export type Assinatura = {
  chave: string;
  nome: string;
  /** Valor da cobrança mais recente (por mês). */
  valorMensal: number;
  ultimaCobranca: string | null;
  /** Conta fixa que representa a assinatura (para "Atualizar conta fixa"). */
  contaFixaId: number | null;
  aumento: { de: number; para: number; percentual: number } | null;
};

const POR_MES: Record<ContaFixa['recorrencia'], number> = { mensal: 1, quinzenal: 2, semanal: 4, anual: 1 / 12, unica: 0 };

/** Categoria "Assinaturas" (pelo nome). */
export function idDaCategoriaAssinaturas(categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[]): number | null {
  return categorias.find((c) => c.tipo === 'despesa' && semAcentos(c.nome) === 'ASSINATURAS')?.id ?? null;
}

/**
 * Aumento da cobrança: a mais recente pelo menos 5% e R$ 1,00 acima da maior das 3 anteriores
 * (comparar com a maior absorve a variação do câmbio em serviços cobrados em dólar).
 */
export function aumentoDaCobranca(valores: number[]): Assinatura['aumento'] {
  if (valores.length < 2) return null;
  const atual = valores[valores.length - 1];
  const anteriores = valores.slice(-4, -1);
  const maior = Math.max(...anteriores);
  if (atual >= maior * 1.05 && atual - maior >= 100) {
    return { de: maior, para: atual, percentual: Math.round((atual / maior - 1) * 100) };
  }
  return null;
}

/**
 * Tudo o que está na categoria Assinaturas: contas fixas e cobranças que se repetem
 * (mesmo texto, em meses diferentes). Aluguel, luz e escola ficam de fora; para incluir algo,
 * basta mudar a categoria para Assinaturas. Lançamentos em ordem de data.
 */
export function detectarAssinaturas(params: {
  lancamentos: Pick<LancamentoDoPeriodo, 'tipo' | 'natureza' | 'descricao' | 'valor' | 'data' | 'categoriaId' | 'link'>[];
  contasFixas: Pick<ContaFixa, 'id' | 'nome' | 'valor' | 'categoriaId' | 'recorrencia' | 'ativo'>[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[];
  hoje: string;
}): { itens: Assinatura[]; totalMensal: number; totalAnual: number } {
  const categoriaId = idDaCategoriaAssinaturas(params.categorias);
  if (categoriaId === null) return { itens: [], totalMensal: 0, totalAnual: 0 };

  const itens: Assinatura[] = [];
  const fixas = params.contasFixas.filter((cf) => cf.ativo !== false && cf.categoriaId === categoriaId && cf.recorrencia !== 'unica');
  for (const cf of fixas) {
    const ocorrencias = params.lancamentos
      .filter((l) => l.tipo === 'conta_fixa' && l.link === `/conta-fixa/${cf.id}` && l.data <= params.hoje)
      .sort((a, b) => a.data.localeCompare(b.data));
    itens.push({
      chave: `fixa-${cf.id}`,
      nome: cf.nome,
      valorMensal: Math.round(cf.valor * POR_MES[cf.recorrencia]),
      ultimaCobranca: ocorrencias[ocorrencias.length - 1]?.data ?? null,
      contaFixaId: cf.id,
      aumento: aumentoDaCobranca(ocorrencias.map((o) => o.valor)),
    });
  }

  // cobranças avulsas na categoria (importadas ou lançadas), agrupadas pelo texto
  const grupos = new Map<string, { nome: string; lancs: { data: string; valor: number }[] }>();
  for (const l of params.lancamentos) {
    if (l.natureza !== 'despesa' || l.categoriaId !== categoriaId || l.tipo === 'conta_fixa' || l.data > params.hoje) continue;
    const chave = textoParaRegra(l.descricao.replace(/\s*\(compra em [^)]*\)\s*$/i, ''));
    if (chave === '') continue;
    const grupo = grupos.get(chave) ?? { nome: l.descricao, lancs: [] };
    grupo.lancs.push({ data: l.data, valor: l.valor });
    grupos.set(chave, grupo);
  }
  for (const [chave, grupo] of grupos) {
    const meses = new Set(grupo.lancs.map((l) => l.data.slice(0, 7)));
    if (meses.size < 2) continue;
    if (fixas.some((cf) => semelhanca(cf.nome, grupo.nome) >= 0.6)) continue;
    const ordenados = [...grupo.lancs].sort((a, b) => a.data.localeCompare(b.data));
    const ultima = ordenados[ordenados.length - 1];
    itens.push({
      chave: `cobranca-${chave}`,
      nome: grupo.nome,
      valorMensal: ultima.valor,
      ultimaCobranca: ultima.data,
      contaFixaId: null,
      aumento: aumentoDaCobranca(ordenados.map((o) => o.valor)),
    });
  }

  itens.sort((a, b) => b.valorMensal - a.valorMensal);
  const totalMensal = itens.reduce((s, i) => s + i.valorMensal, 0);
  return { itens, totalMensal, totalAnual: totalMensal * 12 };
}
