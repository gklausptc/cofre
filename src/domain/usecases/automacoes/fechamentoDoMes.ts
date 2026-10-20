import { mesAnterior } from '@/core/utils/date';
import { gastosPorCategoriaNoMes, progressoDosOrcamentos, type ProgressoDoOrcamento } from './orcamento';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { Categoria, Orcamento } from '@/domain/types/entities';

export type NumerosDoMes = { receitas: number; despesas: number; guardado: number; sobra: number };

/** Receitas, consumo (pela competência), guardado e sobra do mês. */
export function numerosDoMes(lancamentos: Pick<LancamentoDoPeriodo, 'natureza' | 'competencia' | 'valor'>[], mes: string): NumerosDoMes {
  const doMes = lancamentos.filter((l) => l.competencia === mes);
  const somar = (natureza: LancamentoDoPeriodo['natureza']) => doMes.filter((l) => l.natureza === natureza).reduce((s, l) => s + l.valor, 0);
  const receitas = somar('receita');
  const despesas = somar('despesa');
  const guardado = somar('guardado') - somar('resgate');
  return { receitas, despesas, guardado, sobra: receitas - despesas - guardado };
}

export type CategoriaDoFechamento = { categoriaId: number | null; nome: string; gasto: number; referencia: number; motivo: string };

export type FechamentoDoMes = {
  mes: string;
  numeros: NumerosDoMes;
  anterior: NumerosDoMes;
  /** Categorias abaixo do orçamento ou abaixo da média dos 3 meses anteriores. */
  deuCerto: CategoriaDoFechamento[];
  acimaDoOrcamento: ProgressoDoOrcamento[];
  contasPagas: { pagas: number; total: number };
  guardado: { reserva: number; cofrinhos: number };
};

/**
 * Fechamento de um mês que terminou: como foi (comparado com o anterior), o que deu certo,
 * o que passou do orçamento, contas pagas e o que foi guardado. Os blocos de assinaturas,
 * saldo que passou e orçamento sugerido vêm de outros usecases.
 */
export function montarFechamentoDoMes(params: {
  mes: string;
  lancamentos: Pick<LancamentoDoPeriodo, 'natureza' | 'competencia' | 'valor' | 'categoriaId' | 'tipo' | 'status' | 'noCartao'>[];
  orcamentos: Pick<Orcamento, 'id' | 'categoriaId' | 'mesInicio' | 'limite' | 'apenasNoMes'>[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'cor' | 'tipo'>[];
}): FechamentoDoMes {
  const { mes, lancamentos, orcamentos, categorias } = params;
  const progresso = progressoDosOrcamentos(orcamentos, categorias, lancamentos, mes);
  const gastos = gastosPorCategoriaNoMes(lancamentos, mes);
  const anteriores = [mesAnterior(mes)];
  anteriores.push(mesAnterior(anteriores[0]));
  anteriores.push(mesAnterior(anteriores[1]));
  const historico = anteriores.map((m) => gastosPorCategoriaNoMes(lancamentos, m));

  const deuCerto: CategoriaDoFechamento[] = [];
  for (const item of progresso.itens) {
    if (item.gasto < item.limite) {
      deuCerto.push({ categoriaId: item.categoriaId, nome: item.nome, gasto: item.gasto, referencia: item.limite, motivo: 'abaixo do orçamento' });
    }
  }
  const comOrcamento = new Set(progresso.itens.map((i) => i.categoriaId));
  for (const categoria of categorias) {
    if (categoria.tipo !== 'despesa' || comOrcamento.has(categoria.id)) continue;
    const valores = historico.map((h) => h.get(categoria.id) ?? 0);
    if (valores.filter((v) => v > 0).length < 2) continue;
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    const gasto = gastos.get(categoria.id) ?? 0;
    if (gasto <= media * 0.9) {
      deuCerto.push({ categoriaId: categoria.id, nome: categoria.nome, gasto, referencia: Math.round(media), motivo: 'abaixo da média' });
    }
  }
  deuCerto.sort((a, b) => b.referencia - b.gasto - (a.referencia - a.gasto));

  const contasDoMes = lancamentos.filter((l) => l.competencia === mes && l.tipo === 'conta_fixa' && !l.noCartao);
  const guardadoReserva = lancamentos
    .filter((l) => l.competencia === mes && l.tipo === 'reserva')
    .reduce((s, l) => s + (l.natureza === 'guardado' ? l.valor : -l.valor), 0);
  const guardadoCofrinhos = lancamentos
    .filter((l) => l.competencia === mes && l.tipo === 'aporte_cofrinho')
    .reduce((s, l) => s + l.valor, 0);

  return {
    mes,
    numeros: numerosDoMes(lancamentos, mes),
    anterior: numerosDoMes(lancamentos, mesAnterior(mes)),
    deuCerto,
    acimaDoOrcamento: progresso.itens.filter((i) => i.situacao === 'estourado'),
    contasPagas: { pagas: contasDoMes.filter((l) => l.status === 'pago').length, total: contasDoMes.length },
    guardado: { reserva: guardadoReserva, cofrinhos: guardadoCofrinhos },
  };
}
