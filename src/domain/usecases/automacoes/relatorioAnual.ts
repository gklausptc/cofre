import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia } from '@/core/utils/date';
import { numerosDoMes, type NumerosDoMes } from './fechamentoDoMes';
import { ESTILO_DO_RELATORIO, barra, escapar } from './relatorio';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { Cartao, Categoria, MembroFamilia } from '@/domain/types/entities';

export type MesDoAno = NumerosDoMes & { mes: string; temDados: boolean };
export type CategoriaDoAno = { categoriaId: number | null; nome: string; cor: string; total: number; mediaMensal: number; percentual: number };

export type RelatorioAnual = {
  ano: number;
  membro: string | null;
  meses: MesDoAno[];
  total: NumerosDoMes;
  /** Meses com algum lançamento (a média usa só eles). */
  mesesComDados: number;
  mediaMensal: { receitas: number; despesas: number };
  /** Quanto da receita sobrou (0 a 1); null sem receita. */
  taxaDePoupanca: number | null;
  despesasPorCategoria: CategoriaDoAno[];
  receitasPorCategoria: CategoriaDoAno[];
  maioresGastos: { data: string; descricao: string; valor: number; categoria: string }[];
  melhorMes: MesDoAno | null;
  piorMes: MesDoAno | null;
  cartoes: { nome: string; total: number }[];
  membros: { nome: string; total: number }[];
  contas: { nome: string; inicio: number; fim: number }[];
  anoAnterior: NumerosDoMes | null;
};

/**
 * O ano inteiro: receitas, despesas (pela competência — compra no cartão pesa no mês da fatura),
 * guardado e sobra mês a mês; categorias, maiores gastos, cartões, membros e o saldo das contas
 * do começo ao fim do ano. Usa só o que já aconteceu (status pago), não as previsões.
 * `lancamentos` deve cobrir também o ano anterior, para a comparação.
 */
export function montarRelatorioAnual(params: {
  ano: number;
  lancamentos: LancamentoDoPeriodo[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'cor' | 'tipo'>[];
  cartoes: Pick<Cartao, 'id' | 'nome'>[];
  membros: Pick<MembroFamilia, 'id' | 'nome'>[];
  membroId: number | null;
  /** Saldo de cada conta no começo e no fim do ano (calculado fora, com calcularSaldoConta). */
  contas: { nome: string; inicio: number; fim: number }[];
}): RelatorioAnual {
  const { ano, membroId } = params;
  const realizados = params.lancamentos.filter((l) => l.status === 'pago');
  const lancamentos = membroId === null ? realizados : realizados.filter((l) => l.membroId === membroId);
  const doAno = lancamentos.filter((l) => l.competencia.startsWith(`${ano}-`));
  const categoriaPorId = new Map(params.categorias.map((c) => [c.id, c]));

  const meses: MesDoAno[] = Array.from({ length: 12 }, (_, i) => {
    const mes = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const numeros = numerosDoMes(lancamentos, mes);
    return { ...numeros, mes, temDados: doAno.some((l) => l.competencia === mes) };
  });
  const somar = (campo: keyof NumerosDoMes) => meses.reduce((s, m) => s + m[campo], 0);
  const total: NumerosDoMes = { receitas: somar('receitas'), despesas: somar('despesas'), guardado: somar('guardado'), sobra: somar('sobra') };
  const comDados = meses.filter((m) => m.temDados);
  const mesesComDados = comDados.length;

  const porCategoria = (natureza: 'receita' | 'despesa'): CategoriaDoAno[] => {
    const totais = new Map<number | null, number>();
    for (const l of doAno) if (l.natureza === natureza) totais.set(l.categoriaId, (totais.get(l.categoriaId) ?? 0) + l.valor);
    const soma = [...totais.values()].reduce((s, v) => s + v, 0);
    return [...totais]
      .map(([categoriaId, valor]) => {
        const categoria = categoriaId !== null ? categoriaPorId.get(categoriaId) : undefined;
        return {
          categoriaId,
          nome: categoria?.nome ?? 'Sem categoria',
          cor: categoria?.cor ?? '#8891A6',
          total: valor,
          mediaMensal: mesesComDados > 0 ? Math.round(valor / mesesComDados) : 0,
          percentual: soma > 0 ? valor / soma : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  };

  const ordenadosPorSobra = [...comDados].sort((a, b) => b.sobra - a.sobra);
  const porCartao = new Map<number, number>();
  for (const l of doAno) {
    if (l.natureza === 'despesa' && l.noCartao && l.cartaoId !== null) porCartao.set(l.cartaoId, (porCartao.get(l.cartaoId) ?? 0) + l.valor);
  }
  const porMembro = new Map<number | null, number>();
  for (const l of realizados) {
    if (l.natureza !== 'despesa' || !l.competencia.startsWith(`${ano}-`)) continue;
    porMembro.set(l.membroId, (porMembro.get(l.membroId) ?? 0) + l.valor);
  }

  const anterior = Array.from({ length: 12 }, (_, i) => numerosDoMes(lancamentos, `${ano - 1}-${String(i + 1).padStart(2, '0')}`));
  const temAnterior = lancamentos.some((l) => l.competencia.startsWith(`${ano - 1}-`));

  return {
    ano,
    membro: membroId !== null ? (params.membros.find((m) => m.id === membroId)?.nome ?? null) : null,
    meses,
    total,
    mesesComDados,
    mediaMensal: {
      receitas: mesesComDados > 0 ? Math.round(total.receitas / mesesComDados) : 0,
      despesas: mesesComDados > 0 ? Math.round(total.despesas / mesesComDados) : 0,
    },
    taxaDePoupanca: total.receitas > 0 ? (total.receitas - total.despesas) / total.receitas : null,
    despesasPorCategoria: porCategoria('despesa'),
    receitasPorCategoria: porCategoria('receita'),
    maioresGastos: doAno
      .filter((l) => l.natureza === 'despesa')
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)
      .map((l) => ({
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        categoria: l.categoriaId !== null ? (categoriaPorId.get(l.categoriaId)?.nome ?? 'Sem categoria') : 'Sem categoria',
      })),
    melhorMes: ordenadosPorSobra[0] ?? null,
    piorMes: ordenadosPorSobra.length > 1 ? ordenadosPorSobra[ordenadosPorSobra.length - 1] : null,
    cartoes: [...porCartao]
      .map(([id, valor]) => ({ nome: params.cartoes.find((c) => c.id === id)?.nome ?? 'Cartão', total: valor }))
      .sort((a, b) => b.total - a.total),
    membros:
      membroId === null && params.membros.length > 1
        ? [...porMembro]
            .map(([id, valor]) => ({ nome: params.membros.find((m) => m.id === id)?.nome ?? 'Sem membro', total: valor }))
            .sort((a, b) => b.total - a.total)
        : [],
    contas: params.contas,
    anoAnterior: temAnterior
      ? anterior.reduce(
          (s, m) => ({ receitas: s.receitas + m.receitas, despesas: s.despesas + m.despesas, guardado: s.guardado + m.guardado, sobra: s.sobra + m.sobra }),
          { receitas: 0, despesas: 0, guardado: 0, sobra: 0 }
        )
      : null,
  };
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeCurtoDoMes = (mes: string) => MESES_CURTOS[Number(mes.slice(5, 7)) - 1] ?? mes;

function comparar(atual: number, anterior: number): string {
  if (anterior === 0) return '';
  const pct = Math.round((atual / anterior - 1) * 100);
  return pct === 0 ? 'igual ao ano anterior' : `${pct > 0 ? '+' : ''}${pct}% sobre o ano anterior`;
}

/** HTML do relatório do ano para o expo-print. */
export function relatorioAnualEmHtml(r: RelatorioAnual, titulo: string, geradoEm: string): string {
  const linha = (rotulo: string, valor: number, extra = '') =>
    `<tr><td>${escapar(rotulo)}</td><td class="valor">${formatarMoeda(valor)}</td><td class="nota">${escapar(extra)}</td></tr>`;
  const maiorMes = Math.max(0, ...r.meses.map((m) => Math.max(m.receitas, m.despesas)));
  const maiorCategoria = Math.max(0, ...r.despesasPorCategoria.map((c) => c.total));
  const secoes: string[] = [];
  secoes.push(`<h2>Resumo do ano</h2><table>
    ${linha('Receitas', r.total.receitas, r.anoAnterior ? comparar(r.total.receitas, r.anoAnterior.receitas) : '')}
    ${linha('Despesas', r.total.despesas, r.anoAnterior ? comparar(r.total.despesas, r.anoAnterior.despesas) : '')}
    ${linha('Guardado', r.total.guardado)}
    ${linha('Sobrou', r.total.sobra, r.taxaDePoupanca !== null ? `${Math.round(r.taxaDePoupanca * 100)}% da receita não foi gasta` : '')}
    ${linha('Média de receitas por mês', r.mediaMensal.receitas, `${r.mesesComDados} meses com lançamentos`)}
    ${linha('Média de despesas por mês', r.mediaMensal.despesas)}
  </table>`);
  secoes.push(`<h2>Mês a mês</h2><table><tr><th>Mês</th><th class="valor">Receitas</th><th class="valor">Despesas</th><th class="valor">Sobra</th></tr>
    ${r.meses
      .map(
        (m) =>
          `<tr><td>${escapar(formatarMesReferencia(m.mes))}</td><td class="valor">${formatarMoeda(m.receitas)}</td><td class="valor">${formatarMoeda(m.despesas)}</td><td class="valor">${formatarMoeda(m.sobra)}</td></tr>`
      )
      .join('')}
  </table>
  ${r.meses
    .filter((m) => m.temDados)
    .map(
      (m) => `<div class="categoria"><div class="topo"><span>${escapar(formatarMesReferencia(m.mes))}</span><span>${formatarMoeda(m.receitas - m.despesas)}</span></div>
      ${barra(m.receitas, maiorMes, '#06B6D4')}${barra(m.despesas, maiorMes, '#D32F2F')}</div>`
    )
    .join('')}`);
  if (r.despesasPorCategoria.length > 0) {
    secoes.push(`<h2>Para onde foi o dinheiro</h2>
      ${r.despesasPorCategoria
        .map(
          (c) => `<div class="categoria"><div class="topo"><span>${escapar(c.nome)} · ${Math.round(c.percentual * 100)}%</span><span>${formatarMoeda(c.total)}</span></div>
          ${barra(c.total, maiorCategoria, c.cor)}<div class="nota">Média de ${formatarMoeda(c.mediaMensal)} por mês</div></div>`
        )
        .join('')}`);
  }
  if (r.receitasPorCategoria.length > 0) {
    secoes.push(`<h2>De onde veio</h2><table>${r.receitasPorCategoria.map((c) => linha(c.nome, c.total, `${Math.round(c.percentual * 100)}%`)).join('')}</table>`);
  }
  if (r.maioresGastos.length > 0) {
    secoes.push(`<h2>Maiores gastos</h2><table><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="valor">Valor</th></tr>
      ${r.maioresGastos
        .map((g) => `<tr><td>${formatarData(g.data)}</td><td>${escapar(g.descricao)}</td><td>${escapar(g.categoria)}</td><td class="valor">${formatarMoeda(g.valor)}</td></tr>`)
        .join('')}</table>`);
  }
  if (r.cartoes.length > 0) secoes.push(`<h2>Por cartão</h2><table>${r.cartoes.map((c) => linha(c.nome, c.total)).join('')}</table>`);
  if (r.membros.length > 0) secoes.push(`<h2>Por membro</h2><table>${r.membros.map((m) => linha(m.nome, m.total)).join('')}</table>`);
  if (r.contas.length > 0) {
    secoes.push(`<h2>Saldo das contas</h2><table><tr><th>Conta</th><th class="valor">Começo do ano</th><th class="valor">Fim do ano</th></tr>
      ${r.contas.map((c) => `<tr><td>${escapar(c.nome)}</td><td class="valor">${formatarMoeda(c.inicio)}</td><td class="valor">${formatarMoeda(c.fim)}</td></tr>`).join('')}
    </table>`);
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>${escapar(titulo)}</title>
<style>
${ESTILO_DO_RELATORIO}</style></head><body>
<h1>${escapar(titulo)}</h1>
<p class="sub">${r.ano}${r.membro ? ` · ${escapar(r.membro)}` : ''} · gerado em ${escapar(geradoEm)}</p>
${secoes.join('\n')}
</body></html>`;
}
