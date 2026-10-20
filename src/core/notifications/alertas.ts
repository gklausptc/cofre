import { addDays, format } from 'date-fns';
import { repositorios } from '@/domain/repositories';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { progressoDosOrcamentos } from '@/domain/usecases/automacoes/orcamento';
import { lerConfigNotificacoes } from '@/domain/usecases/notificacoes/configNotificacoes';
import { formatarMoeda } from '@/core/utils/currency';
import { notificarImediatamente, situacaoDaPermissao } from './notificationService';

/** Lista de chaves (JSON) guardada nas preferências. */
export function lerChaves(json: string | null): string[] {
  if (!json) return [];
  try {
    const lista = JSON.parse(json) as unknown;
    return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Avisa na hora quando uma categoria chega em 80% ou passa de 100% do orçamento do mês
 * (uma vez por categoria/mês/marco, guardado em preferencias.alertas_enviados).
 */
export async function avisarOrcamentos(agora: Date = new Date()): Promise<void> {
  if ((await situacaoDaPermissao()) !== 'concedida') return;
  const repos = repositorios();
  const preferencias = await repos.preferencias.buscarPreferencias();
  if (!lerConfigNotificacoes(preferencias.configNotificacoes).orcamento.ativo) return;
  const orcamentos = await repos.orcamentos.listarOrcamentos();
  if (orcamentos.length === 0) return;

  const mes = format(agora, 'yyyy-MM');
  const [movimentacoes, gastos, parcelas, contasFixas, comprasParceladas, cartoes, faturas, categorias] = await Promise.all([
    repos.movimentacoes.listarMovimentacoes(),
    repos.gastosRapidos.listarGastosRapidos(),
    repos.parcelas.listarParcelas(),
    repos.contasFixas.listarContasFixas(),
    repos.comprasParceladas.listarComprasParceladas(),
    repos.cartoes.listarCartoes(),
    repos.faturas.listarFaturas(),
    repos.categorias.listarCategorias(),
  ]);
  const lancamentos = obterLancamentosDoPeriodo(
    `${format(addDays(agora, -70), 'yyyy-MM')}-01`,
    format(addDays(agora, 45), 'yyyy-MM-dd'),
    { movimentacoes, gastos, parcelas, contasFixas, comprasParceladas, cartoes, faturas },
    format(agora, 'yyyy-MM-dd')
  );
  const { itens } = progressoDosOrcamentos(orcamentos, categorias, lancamentos, mes);

  const enviados = new Set(lerChaves(preferencias.alertasEnviados));
  let mudou = false;
  for (const item of itens) {
    if (item.situacao === 'ok') continue;
    const marco = item.situacao === 'estourado' ? 100 : 80;
    const chave = `${item.categoriaId}-${mes}-${marco}`;
    if (enviados.has(chave)) continue;
    enviados.add(chave);
    if (marco === 100) enviados.add(`${item.categoriaId}-${mes}-80`);
    mudou = true;
    await notificarImediatamente(
      marco === 100 ? `${item.nome} passou do orçamento` : `${item.nome} chegou a 80% do orçamento`,
      `${formatarMoeda(item.gasto)} de ${formatarMoeda(item.limite)} neste mês.`,
      '/orcamento'
    );
  }
  if (mudou) {
    // guarda só os do mês atual e do anterior
    const recentes = [...enviados].filter((c) => c.includes(`-${mes}-`) || c.includes(`-${format(addDays(agora, -31), 'yyyy-MM')}-`));
    await repos.preferencias.atualizarPreferencias({ alertasEnviados: JSON.stringify(recentes) });
  }
}

