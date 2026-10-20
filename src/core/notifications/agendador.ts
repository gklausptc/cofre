import { addDays, format } from 'date-fns';
import { repositorios } from '@/domain/repositories';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { lerAdiamentos, lerConfigNotificacoes } from '@/domain/usecases/notificacoes/configNotificacoes';
import {
  amanhaAsNove,
  planejarNotificacoes,
  textoDoResumoSemanal,
} from '@/domain/usecases/notificacoes/planejarNotificacoes';
import type { EfeitosDaImportacao } from '@/domain/repositories/importacoesRepository';
import { agendarTodas, pedirPermissao, situacaoDaPermissao } from './notificationService';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * Cancela e reagenda todas as notificações locais a partir dos dados de agora. Chamada ao
 * abrir o app, ao voltar do segundo plano e depois de qualquer mudança que mexa em
 * vencimentos (contas fixas, parcelas, faturas, importações, configurações). Sem permissão
 * concedida não faz nada (o pedido é contextual: ver `pedirPermissaoNaPrimeiraVez`).
 */
export async function reagendarTodas(): Promise<void> {
  if ((await situacaoDaPermissao()) !== 'concedida') return;
  const repos = repositorios();
  const agora = new Date();
  const [
    preferencias,
    movimentacoes,
    gastos,
    parcelas,
    contasFixas,
    comprasParceladas,
    cartoes,
    faturas,
    importacoes,
    contas,
    categorias,
  ] = await Promise.all([
    repos.preferencias.buscarPreferencias(),
    repos.movimentacoes.listarMovimentacoes(),
    repos.gastosRapidos.listarGastosRapidos(),
    repos.parcelas.listarParcelas(),
    repos.contasFixas.listarContasFixas(),
    repos.comprasParceladas.listarComprasParceladas(),
    repos.cartoes.listarCartoes(),
    repos.faturas.listarFaturas(),
    repos.importacoes.listarImportacoes(),
    repos.contasBancarias.listarContasBancarias(),
    repos.categorias.listarCategorias(),
  ]);

  const lancamentos = obterLancamentosDoPeriodo(
    iso(addDays(agora, -35)),
    iso(addDays(agora, 65)),
    { movimentacoes, gastos, parcelas, contasFixas, comprasParceladas, cartoes, faturas },
    iso(agora)
  );

  const contasFixasDaImportacao = new Set<number>();
  for (const imp of importacoes) {
    if (!imp.efeitos) continue;
    const efeitos = JSON.parse(imp.efeitos) as EfeitosDaImportacao;
    for (const id of efeitos.contasFixasCriadas ?? []) contasFixasDaImportacao.add(id);
  }

  // última importação de cada conta/cartão (importacoes vem da mais nova para a mais antiga)
  const ultimas = new Map<string, { chave: string; nome: string; quando: string }>();
  for (const imp of importacoes) {
    const chave = imp.contaBancariaId !== null ? `conta-${imp.contaBancariaId}` : `cartao-${imp.cartaoId}`;
    if (ultimas.has(chave)) continue;
    const nome =
      imp.contaBancariaId !== null
        ? contas.find((c) => c.id === imp.contaBancariaId)?.nomeConta
        : cartoes.find((c) => c.id === imp.cartaoId)?.nome;
    if (nome) ultimas.set(chave, { chave, nome, quando: imp.criadaEm });
  }

  const datas = [...movimentacoes.map((m) => m.data), ...gastos.map((g) => g.data)].sort();
  const referenciaBackup = preferencias.ultimoBackupEm ?? (datas[0] ? `${datas[0]}T12:00:00` : null);
  const nomeDaCategoria = (id: number | null) => categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria';

  const planejadas = planejarNotificacoes({
    agora,
    config: lerConfigNotificacoes(preferencias.configNotificacoes),
    lancamentos,
    cartoes,
    contasFixasDaImportacao,
    ultimasImportacoes: [...ultimas.values()],
    referenciaBackup,
    resumoSemanal: textoDoResumoSemanal(lancamentos, agora, nomeDaCategoria),
    adiamentos: lerAdiamentos(preferencias.adiamentosNotificacoes, agora),
  });
  await agendarTodas(planejadas);
}

let espera: ReturnType<typeof setTimeout> | null = null;

/** Reagenda logo depois de uma mudança (várias mudanças seguidas viram um reagendamento só). */
export function pedirReagendamento(): void {
  if (espera) clearTimeout(espera);
  espera = setTimeout(() => {
    espera = null;
    reagendarTodas().catch((erro: unknown) => console.warn('Falha ao reagendar notificações', erro));
  }, 1500);
}

/** "Lembrar amanhã": guarda o adiamento (vale entre reagendamentos) e reagenda. */
export async function adiarParaAmanha(id: string): Promise<void> {
  const repos = repositorios();
  const preferencias = await repos.preferencias.buscarPreferencias();
  const agora = new Date();
  const adiamentos = { ...lerAdiamentos(preferencias.adiamentosNotificacoes, agora), [id]: amanhaAsNove(agora).toISOString() };
  await repos.preferencias.atualizarPreferencias({ adiamentosNotificacoes: JSON.stringify(adiamentos) });
  await reagendarTodas();
}

/**
 * Pede a permissão de notificação na primeira vez que faz sentido (a primeira conta fixa),
 * e não na abertura do app. Depois disso, só pela tela de Notificações.
 */
export async function pedirPermissaoNaPrimeiraVez(): Promise<void> {
  const repos = repositorios();
  const preferencias = await repos.preferencias.buscarPreferencias();
  if (preferencias.permissaoNotificacoesPedida) return;
  await repos.preferencias.atualizarPreferencias({ permissaoNotificacoesPedida: true });
  if ((await situacaoDaPermissao()) === 'nao_pedida') await pedirPermissao();
  await reagendarTodas();
}
