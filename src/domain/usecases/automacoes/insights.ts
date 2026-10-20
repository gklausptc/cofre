import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import type { DiaNegativo } from './saldoProjetado';
import type { ProgressoDoOrcamento } from './orcamento';
import type { Assinatura } from './assinaturas';
import type { CartaoParaHoje } from './simuladores';
import { descreverCartaoParaHoje } from './simuladores';
import { comparadoAoNormal } from '@/domain/usecases/importacao/resultadoDaImportacao';

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

/** Tela do lançamento ("mov-12" → editar movimentação; "gasto-3" → editar gasto). */
export function telaDoLancamento(id: string): string {
  const [tipo, numero] = id.split('-');
  if (tipo === 'mov' && numero) return `/movimentacao/${numero}`;
  if (tipo === 'gasto' && numero) return `/gasto-rapido/${numero}`;
  return '/busca';
}

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
  /** Pagamentos de fatura que estão contando como gasto, e faturas antigas sem pagamento. */
  pagamentosSoltos?: number;
  faturasAntigas?: number;
}): Insight[] {
  const todos: Insight[] = [];
  if (params.pagamentosSoltos && params.pagamentosSoltos > 0) {
    const n = params.pagamentosSoltos;
    todos.push({
      chave: `pagamentos-soltos-${params.hoje}-${n}`,
      tom: 'alerta',
      texto:
        n === 1
          ? 'Um pagamento de fatura está contando como gasto (em dobro com as compras). Toque para corrigir.'
          : `${n} pagamentos de fatura estão contando como gasto (em dobro com as compras). Toque para corrigir.`,
      url: '/agenda',
    });
  }
  if (params.faturasAntigas && params.faturasAntigas > 0) {
    const n = params.faturasAntigas;
    todos.push({
      chave: `faturas-antigas-${n}`,
      tom: 'atencao',
      texto: n === 1 ? 'Uma fatura antiga aparece como atrasada. Já pagou? Marque na Agenda.' : `${n} faturas antigas aparecem como atrasadas. Já pagou? Marque na Agenda.`,
      url: '/agenda',
    });
  }
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
      texto: `A cobrança mensal de ${a.nome} subiu de ${formatarMoeda(a.aumento.de)} para ${formatarMoeda(a.aumento.para)} (+${a.aumento.percentual}%)${
        a.ultimaCobranca ? `, na cobrança de ${formatarData(a.ultimaCobranca, 'dd/MM')}` : ''
      }. Toque para ver o histórico.`,
      url: '/assinaturas',
    });
  }
  for (const f of params.foraDoPadrao) {
    todos.push({
      chave: `fora-${f.id}`,
      tom: 'atencao',
      texto: `${f.descricao}: ${formatarMoeda(f.valor)}, ${comparadoAoNormal(f.valor, f.media, 'a média', 'da média')} de ${formatarMoeda(f.media)}. Toque para ver o lançamento.`,
      url: telaDoLancamento(f.id),
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
