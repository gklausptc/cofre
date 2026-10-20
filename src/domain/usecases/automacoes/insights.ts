import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import type { DiaNegativo } from './saldoProjetado';
import type { ProgressoDoOrcamento } from './orcamento';
import type { Assinatura } from './assinaturas';
import type { CartaoParaHoje } from './simuladores';
import { descreverCartaoParaHoje } from './simuladores';

export type Insight = {
  /** Muda quando a situação muda (o "Entendi" vale só para esta situação). */
  chave: string;
  tom: 'alerta' | 'atencao' | 'info';
  texto: string;
  /** Rota que o toque abre. */
  url: string;
};

export type GastoForaDoNormal = { id: string; descricao: string; valor: number; media: number; percentual: number };

export const MAXIMO_NO_INICIO = 3;

/**
 * Insights automáticos do Início, em ordem de importância: saldo previsto negativo,
 * orçamento estourado, assinatura que aumentou, gasto fora do padrão, orçamento em 80% e o
 * melhor cartão para hoje (só com 2 ou mais cartões). Os dispensados com "Entendi" saem,
 * até a situação mudar (a chave inclui os valores).
 */
export function gerarInsights(params: {
  negativos: DiaNegativo[];
  orcamentos: ProgressoDoOrcamento[];
  mes: string;
  assinaturas: Assinatura[];
  foraDoPadrao: GastoForaDoNormal[];
  cartoesHoje: CartaoParaHoje[];
  hoje: string;
  dispensados: string[];
}): Insight[] {
  const todos: Insight[] = [];
  for (const n of params.negativos) {
    todos.push({
      chave: `negativo-${n.contaBancariaId}-${n.data}`,
      tom: 'alerta',
      texto: `A conta ${n.nomeConta} fica negativa dia ${formatarData(n.data, 'dd/MM')}: ${formatarMoeda(n.saldo)}.`,
      url: `/conta-bancaria/${n.contaBancariaId}`,
    });
  }
  for (const o of params.orcamentos.filter((x) => x.situacao === 'estourado')) {
    todos.push({
      chave: `orcamento-${o.categoriaId}-${params.mes}-100`,
      tom: 'alerta',
      texto: `${o.nome} passou do orçamento: ${formatarMoeda(o.gasto)} de ${formatarMoeda(o.limite)}.`,
      url: '/orcamento',
    });
  }
  for (const a of params.assinaturas) {
    if (!a.aumento) continue;
    todos.push({
      chave: `assinatura-${a.chave}-${a.aumento.para}`,
      tom: 'atencao',
      texto: `${a.nome} subiu de ${formatarMoeda(a.aumento.de)} para ${formatarMoeda(a.aumento.para)} (+${a.aumento.percentual}%).`,
      url: '/assinaturas',
    });
  }
  for (const f of params.foraDoPadrao) {
    todos.push({
      chave: `fora-${f.id}`,
      tom: 'atencao',
      texto: `${f.descricao} veio ${formatarMoeda(f.valor)}, ${f.percentual}% acima da média.`,
      url: '/busca',
    });
  }
  for (const o of params.orcamentos.filter((x) => x.situacao === 'atencao')) {
    todos.push({
      chave: `orcamento-${o.categoriaId}-${params.mes}-80`,
      tom: 'atencao',
      texto: `${o.nome} já usou ${Math.round(o.proporcao * 100)}% do orçamento: ${formatarMoeda(o.gasto)} de ${formatarMoeda(o.limite)}.`,
      url: '/orcamento',
    });
  }
  if (params.cartoesHoje.length >= 2) {
    const melhor = params.cartoesHoje[0];
    todos.push({
      chave: `cartao-${params.hoje}`,
      tom: 'info',
      texto: `Melhor cartão hoje: ${descreverCartaoParaHoje(melhor)}.`,
      url: '/cartoes',
    });
  }
  const dispensados = new Set(params.dispensados);
  return todos.filter((i) => !dispensados.has(i.chave));
}
