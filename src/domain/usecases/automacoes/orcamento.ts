import { mesAnterior } from '@/core/utils/date';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { Categoria, Orcamento } from '@/domain/types/entities';

/**
 * Limite que vale para a categoria no mês: o "só neste mês", se houver; senão o mais recente
 * que começou até esse mês. null = sem orçamento.
 */
export function orcamentoDoMes(
  orcamentos: Pick<Orcamento, 'id' | 'categoriaId' | 'mesInicio' | 'limite' | 'apenasNoMes'>[],
  categoriaId: number,
  mes: string
): number | null {
  const daCategoria = orcamentos.filter((o) => o.categoriaId === categoriaId);
  const soNoMes = daCategoria.filter((o) => o.apenasNoMes && o.mesInicio === mes).sort((a, b) => b.id - a.id)[0];
  if (soNoMes) return soNoMes.limite;
  const vigente = daCategoria
    .filter((o) => !o.apenasNoMes && o.mesInicio <= mes)
    .sort((a, b) => b.mesInicio.localeCompare(a.mesInicio) || b.id - a.id)[0];
  return vigente ? vigente.limite : null;
}

/**
 * Quanto foi gasto em cada categoria no mês, pela competência (compra no cartão pesa no mês
 * da fatura). Só consumo: pagamento de fatura/conta fixa, transferência e o total da fatura
 * ficam de fora (as compras dela já entram uma a uma).
 */
export function gastosPorCategoriaNoMes(
  lancamentos: Pick<LancamentoDoPeriodo, 'natureza' | 'competencia' | 'categoriaId' | 'valor'>[],
  mes: string
): Map<number | null, number> {
  const totais = new Map<number | null, number>();
  for (const l of lancamentos) {
    if (l.natureza !== 'despesa' || l.competencia !== mes) continue;
    totais.set(l.categoriaId, (totais.get(l.categoriaId) ?? 0) + l.valor);
  }
  return totais;
}

export type SituacaoDoOrcamento = 'ok' | 'atencao' | 'estourado';

export type ProgressoDoOrcamento = {
  categoriaId: number;
  nome: string;
  cor: string;
  limite: number;
  gasto: number;
  /** De 0 a 1 (ou mais, se passou). */
  proporcao: number;
  situacao: SituacaoDoOrcamento;
};

export const LIMIAR_ATENCAO = 0.8;

export function situacaoDoOrcamento(gasto: number, limite: number): SituacaoDoOrcamento {
  if (limite <= 0) return 'ok';
  if (gasto >= limite) return 'estourado';
  return gasto >= limite * LIMIAR_ATENCAO ? 'atencao' : 'ok';
}

/** Barras do mês: cada categoria com orçamento, do mais apertado para o mais folgado. */
export function progressoDosOrcamentos(
  orcamentos: Pick<Orcamento, 'id' | 'categoriaId' | 'mesInicio' | 'limite' | 'apenasNoMes'>[],
  categorias: Pick<Categoria, 'id' | 'nome' | 'cor' | 'tipo'>[],
  lancamentos: Pick<LancamentoDoPeriodo, 'natureza' | 'competencia' | 'categoriaId' | 'valor'>[],
  mes: string
): { itens: ProgressoDoOrcamento[]; orcado: number; gasto: number } {
  const gastos = gastosPorCategoriaNoMes(lancamentos, mes);
  const itens: ProgressoDoOrcamento[] = [];
  for (const categoria of categorias) {
    if (categoria.tipo !== 'despesa') continue;
    const limite = orcamentoDoMes(orcamentos, categoria.id, mes);
    if (limite === null || limite <= 0) continue;
    const gasto = gastos.get(categoria.id) ?? 0;
    itens.push({
      categoriaId: categoria.id,
      nome: categoria.nome,
      cor: categoria.cor,
      limite,
      gasto,
      proporcao: gasto / limite,
      situacao: situacaoDoOrcamento(gasto, limite),
    });
  }
  itens.sort((a, b) => b.proporcao - a.proporcao);
  return {
    itens,
    orcado: itens.reduce((s, i) => s + i.limite, 0),
    gasto: itens.reduce((s, i) => s + i.gasto, 0),
  };
}

export type SugestaoDeOrcamento = {
  categoriaId: number;
  nome: string;
  /** Média dos 3 meses fechados, arredondada para cima em múltiplos de R$ 10. */
  sugestao: number;
  media: number;
  meses: string[];
};

const DEZ_REAIS = 1000;

/**
 * Sugestão de limite por categoria: média dos 3 últimos meses fechados antes de `mes`, pela
 * competência, só para categorias com gasto em pelo menos 2 desses meses. Arredonda para
 * cima em múltiplos de R$ 10.
 */
export function sugerirOrcamentos(
  lancamentos: Pick<LancamentoDoPeriodo, 'natureza' | 'competencia' | 'categoriaId' | 'valor'>[],
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[],
  mes: string
): SugestaoDeOrcamento[] {
  const meses = [mesAnterior(mes)];
  meses.push(mesAnterior(meses[0]));
  meses.push(mesAnterior(meses[1]));
  meses.reverse();
  const porMes = meses.map((m) => gastosPorCategoriaNoMes(lancamentos, m));

  const sugestoes: SugestaoDeOrcamento[] = [];
  for (const categoria of categorias) {
    if (categoria.tipo !== 'despesa') continue;
    const valores = porMes.map((totais) => totais.get(categoria.id) ?? 0);
    if (valores.filter((v) => v > 0).length < 2) continue;
    const media = Math.round(valores.reduce((s, v) => s + v, 0) / meses.length);
    sugestoes.push({
      categoriaId: categoria.id,
      nome: categoria.nome,
      sugestao: Math.ceil(media / DEZ_REAIS) * DEZ_REAIS,
      media,
      meses,
    });
  }
  return sugestoes.sort((a, b) => b.sugestao - a.sugestao);
}

/** Marco que o gasto acabou de passar (80% ou 100% do limite), para avisar uma vez só. */
export function alertaDeOrcamento(antes: number, depois: number, limite: number): 80 | 100 | null {
  if (limite <= 0 || depois <= antes) return null;
  if (antes < limite && depois >= limite) return 100;
  if (antes < limite * LIMIAR_ATENCAO && depois >= limite * LIMIAR_ATENCAO) return 80;
  return null;
}
