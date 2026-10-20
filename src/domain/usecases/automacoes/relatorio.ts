import { addMonths, format, parseISO } from 'date-fns';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarDataHora, formatarMesReferencia, mesAnterior } from '@/core/utils/date';
import { gastosPorCategoriaNoMes, orcamentoDoMes } from './orcamento';
import { numerosDoMes, type NumerosDoMes } from './fechamentoDoMes';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { Categoria, MembroFamilia, Orcamento } from '@/domain/types/entities';
import type { ProjecaoMes } from '@/domain/usecases/projetarFluxoCaixa';

export type LinhaDeCategoria = { nome: string; cor: string; total: number; media: number; orcamento: number | null };

export type Relatorio = {
  titulo: string;
  mes: string;
  membro: string | null;
  geradoEm: string;
  resumo: NumerosDoMes;
  anterior: NumerosDoMes;
  contas: { nome: string; inicio: number; fim: number }[];
  categorias: LinhaDeCategoria[];
  membros: { nome: string; total: number }[];
  cartoes: { nome: string; valor: number; paga: boolean }[];
  ultimosMeses: { mes: string; receitas: number; despesas: number }[];
  comprometido: { mes: string; valor: number }[];
  lancamentos: { data: string; descricao: string; valor: number; natureza: LancamentoDoPeriodo['natureza'] }[] | null;
};

/** Junta os números do relatório do mês (opcionalmente só de um membro da família). */
export function montarRelatorio(params: {
  mes: string;
  lancamentos: LancamentoDoPeriodo[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'cor' | 'tipo'>[];
  orcamentos: Pick<Orcamento, 'id' | 'categoriaId' | 'mesInicio' | 'limite' | 'apenasNoMes'>[];
  membros: Pick<MembroFamilia, 'id' | 'nome'>[];
  membroId: number | null;
  /** Saldo de cada conta no início e no fim do mês (calculado fora, com calcularSaldoConta). */
  contas: { nome: string; inicio: number; fim: number }[];
  /** Projeção dos próximos 12 meses (projetarFluxoCaixa) para o "comprometido". */
  projecao: ProjecaoMes[];
  incluirLancamentos: boolean;
  agora: Date;
  nomeDoApp: string;
}): Relatorio {
  const { mes, categorias, orcamentos, membroId } = params;
  const lancamentos = membroId === null ? params.lancamentos : params.lancamentos.filter((l) => l.membroId === membroId);
  const nomeDaCategoria = new Map(categorias.map((c) => [c.id, c]));

  const gastos = gastosPorCategoriaNoMes(lancamentos, mes);
  const anteriores = [mesAnterior(mes)];
  anteriores.push(mesAnterior(anteriores[0]));
  anteriores.push(mesAnterior(anteriores[1]));
  const historico = anteriores.map((m) => gastosPorCategoriaNoMes(lancamentos, m));
  const linhas: LinhaDeCategoria[] = [...gastos].map(([categoriaId, total]) => {
    const categoria = categoriaId !== null ? nomeDaCategoria.get(categoriaId) : undefined;
    return {
      nome: categoria?.nome ?? 'Sem categoria',
      cor: categoria?.cor ?? '#8891A6',
      total,
      media: Math.round(historico.reduce((s, h) => s + (h.get(categoriaId) ?? 0), 0) / 3),
      orcamento: categoriaId !== null ? orcamentoDoMes(orcamentos, categoriaId, mes) : null,
    };
  });
  linhas.sort((a, b) => b.total - a.total);

  const porMembro = new Map<number | null, number>();
  for (const l of params.lancamentos) {
    if (l.natureza !== 'despesa' || l.competencia !== mes) continue;
    porMembro.set(l.membroId, (porMembro.get(l.membroId) ?? 0) + l.valor);
  }
  const membros =
    membroId === null && params.membros.length > 1
      ? [...porMembro].map(([id, total]) => ({ nome: params.membros.find((m) => m.id === id)?.nome ?? 'Sem membro', total })).sort((a, b) => b.total - a.total)
      : [];

  const cartoes = params.lancamentos
    .filter((l) => l.natureza === 'fatura' && l.competencia === mes)
    .map((l) => ({ nome: l.descricao, valor: l.valor, paga: l.status === 'pago' }));

  const ultimosMeses = Array.from({ length: 6 }, (_, i) => format(addMonths(parseISO(`${mes}-01`), i - 5), 'yyyy-MM')).map((m) => {
    const n = numerosDoMes(lancamentos, m);
    return { mes: m, receitas: n.receitas, despesas: n.despesas };
  });

  return {
    titulo: `${params.nomeDoApp} · Relatório de ${formatarMesReferencia(mes)}`,
    mes,
    membro: membroId !== null ? (params.membros.find((m) => m.id === membroId)?.nome ?? null) : null,
    geradoEm: formatarDataHora(params.agora),
    resumo: numerosDoMes(lancamentos, mes),
    anterior: numerosDoMes(lancamentos, mesAnterior(mes)),
    contas: params.contas,
    categorias: linhas,
    membros,
    cartoes,
    ultimosMeses,
    comprometido: params.projecao.map((p) => ({ mes: p.mes, valor: p.despesaPrevista })),
    lancamentos: params.incluirLancamentos
      ? lancamentos
          .filter((l) => l.competencia === mes && l.natureza !== 'fatura')
          .sort((a, b) => a.data.localeCompare(b.data))
          .map((l) => ({ data: l.data, descricao: l.descricao, valor: l.valor, natureza: l.natureza }))
      : null,
  };
}

const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function variacao(atual: number, anterior: number): string {
  if (anterior === 0) return '';
  const pct = Math.round((atual / anterior - 1) * 100);
  return pct === 0 ? ' (igual ao mês anterior)' : ` (${pct > 0 ? '+' : ''}${pct}% sobre o mês anterior)`;
}

function barra(valor: number, maximo: number, cor: string): string {
  const largura = maximo > 0 ? Math.max(1, Math.round((valor / maximo) * 100)) : 0;
  return `<div class="trilho"><div class="barra" style="width:${largura}%;background:${cor}"></div></div>`;
}

const NATUREZA: Record<LancamentoDoPeriodo['natureza'], string> = {
  receita: 'Entrada',
  despesa: 'Gasto',
  fatura: 'Fatura',
  pagamento: 'Pagamento',
  transferencia: 'Transferência',
  guardado: 'Guardado',
  resgate: 'Resgate',
};

/** HTML do relatório para o expo-print (A4, cores da marca, sem imagens externas). */
export function relatorioEmHtml(r: Relatorio): string {
  const maiorCategoria = Math.max(0, ...r.categorias.map((c) => Math.max(c.total, c.media, c.orcamento ?? 0)));
  const maiorMes = Math.max(0, ...r.ultimosMeses.map((m) => Math.max(m.receitas, m.despesas)));
  const maiorComprometido = Math.max(0, ...r.comprometido.map((c) => c.valor));
  const linha = (rotulo: string, valor: number, extra = '') =>
    `<tr><td>${escapar(rotulo)}</td><td class="valor">${formatarMoeda(valor)}</td><td class="nota">${escapar(extra)}</td></tr>`;

  const secoes: string[] = [];
  secoes.push(`<h2>Resumo</h2><table>
    ${linha('Receitas', r.resumo.receitas, variacao(r.resumo.receitas, r.anterior.receitas))}
    ${linha('Despesas', r.resumo.despesas, variacao(r.resumo.despesas, r.anterior.despesas))}
    ${linha('Guardado', r.resumo.guardado)}
    ${linha('Sobra', r.resumo.sobra, variacao(r.resumo.sobra, r.anterior.sobra))}
  </table>`);
  if (r.contas.length > 0) {
    secoes.push(`<h2>Saldo por conta</h2><table><tr><th>Conta</th><th class="valor">Início do mês</th><th class="valor">Fim do mês</th></tr>
      ${r.contas.map((c) => `<tr><td>${escapar(c.nome)}</td><td class="valor">${formatarMoeda(c.inicio)}</td><td class="valor">${formatarMoeda(c.fim)}</td></tr>`).join('')}
    </table>`);
  }
  if (r.categorias.length > 0) {
    secoes.push(`<h2>Despesas por categoria</h2>
      ${r.categorias
        .map(
          (c) => `<div class="categoria"><div class="topo"><span>${escapar(c.nome)}</span><span>${formatarMoeda(c.total)}</span></div>
          ${barra(c.total, maiorCategoria, c.cor)}
          <div class="nota">Média de 3 meses: ${formatarMoeda(c.media)}${c.orcamento !== null ? ` · Orçamento: ${formatarMoeda(c.orcamento)}` : ''}</div></div>`
        )
        .join('')}`);
  }
  if (r.membros.length > 0) {
    secoes.push(`<h2>Por membro</h2><table>${r.membros.map((m) => linha(m.nome, m.total)).join('')}</table>`);
  }
  if (r.cartoes.length > 0) {
    secoes.push(`<h2>Por cartão</h2><table>${r.cartoes.map((c) => linha(c.nome, c.valor, c.paga ? 'paga' : 'em aberto')).join('')}</table>`);
  }
  secoes.push(`<h2>Receita × despesa (6 meses)</h2>
    ${r.ultimosMeses
      .map(
        (m) => `<div class="categoria"><div class="topo"><span>${escapar(formatarMesReferencia(m.mes))}</span><span>${formatarMoeda(m.receitas - m.despesas)}</span></div>
        ${barra(m.receitas, maiorMes, '#06B6D4')}${barra(m.despesas, maiorMes, '#D32F2F')}
        <div class="nota">Receitas ${formatarMoeda(m.receitas)} · Despesas ${formatarMoeda(m.despesas)}</div></div>`
      )
      .join('')}`);
  if (r.comprometido.some((c) => c.valor > 0)) {
    secoes.push(`<h2>Comprometido nos próximos 12 meses</h2><p class="nota">Contas fixas, parcelas e compras no cartão já lançadas.</p>
      ${r.comprometido
        .map((c) => `<div class="categoria"><div class="topo"><span>${escapar(formatarMesReferencia(c.mes))}</span><span>${formatarMoeda(c.valor)}</span></div>${barra(c.valor, maiorComprometido, '#2A5CE0')}</div>`)
        .join('')}`);
  }
  if (r.lancamentos) {
    secoes.push(`<h2>Lançamentos</h2><table><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th class="valor">Valor</th></tr>
      ${r.lancamentos
        .map((l) => `<tr><td>${formatarData(l.data)}</td><td>${escapar(l.descricao)}</td><td>${NATUREZA[l.natureza]}</td><td class="valor">${formatarMoeda(l.valor)}</td></tr>`)
        .join('')}
    </table>`);
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>${escapar(r.titulo)}</title>
<style>
  @page { margin: 18mm 14mm; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #0F1320; font-size: 11px; }
  h1 { font-size: 18px; margin: 0; color: #2A5CE0; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #CBD2E0; padding-bottom: 4px; }
  .sub { color: #666E7E; margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 4px 6px; border-bottom: 1px solid #E4E8EF; text-align: left; }
  th { color: #666E7E; font-weight: 600; }
  .valor { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nota { color: #666E7E; font-size: 10px; }
  .categoria { margin-bottom: 8px; page-break-inside: avoid; }
  .topo { display: flex; justify-content: space-between; margin-bottom: 2px; }
  .trilho { height: 7px; background: #E4E8EF; border-radius: 4px; margin: 2px 0; overflow: hidden; }
  .barra { height: 7px; border-radius: 4px; }
</style></head><body>
<h1>${escapar(r.titulo)}</h1>
<p class="sub">${escapar(formatarMesReferencia(r.mes))}${r.membro ? ` · ${escapar(r.membro)}` : ''} · gerado em ${escapar(r.geradoEm)}</p>
${secoes.join('\n')}
</body></html>`;
}
