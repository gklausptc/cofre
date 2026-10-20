import { addDays, addMonths, format, parseISO, startOfDay } from 'date-fns';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia } from '@/core/utils/date';
import { dataFechamentoDaFatura } from '@/domain/usecases/mesDaFatura';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { Cartao } from '@/domain/types/entities';
import type { Adiamentos, ConfigNotificacoes, TipoNotificacao } from './configNotificacoes';

/** Ações que aparecem na notificação (categorias do expo-notifications). */
export type CategoriaDeNotificacao = 'conta_fixa' | 'lembrete';

export type NotificacaoPlanejada = {
  /** Estável entre reagendamentos (o "Lembrar amanhã" usa ele). */
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  data: Date;
  categoria: CategoriaDeNotificacao | null;
  /** Rota que abre ao tocar (Expo Router). */
  url: string;
  /** Ocorrência de conta fixa: o "Marcar como paga" da notificação dá baixa nela. */
  parcelaId: number | null;
};

/** O iOS guarda no máximo 64 notificações agendadas por app; fica uma folga. */
export const LIMITE_AGENDADAS = 60;

export type EntradaDoPlanejamento = {
  agora: Date;
  config: ConfigNotificacoes;
  /** De ~35 dias atrás a ~60 dias à frente (obterLancamentosDoPeriodo). */
  lancamentos: LancamentoDoPeriodo[];
  cartoes: Pick<Cartao, 'id' | 'nome' | 'diaFechamento' | 'diaVencimento'>[];
  /** Contas fixas que nasceram de uma resposta da importação (toggle próprio). */
  contasFixasDaImportacao: Set<number>;
  /** Última importação de cada conta/cartão já importado. */
  ultimasImportacoes: { chave: string; nome: string; quando: string }[];
  /** Último backup, ou a data do primeiro lançamento se nunca fez (null = app vazio). */
  referenciaBackup: string | null;
  /** Texto do resumo semanal já calculado (null = sem gastos para resumir). */
  resumoSemanal: string | null;
  adiamentos: Adiamentos;
};

function noHorario(dia: Date, hora: number): Date {
  const d = startOfDay(dia);
  d.setHours(hora, 0, 0, 0);
  return d;
}

const dataDoIso = (iso: string) => parseISO(iso.length === 10 ? `${iso}T00:00:00` : iso);

function quando(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

/** ID do contaFixaId a partir do link '/conta-fixa/12'. */
function contaFixaDoLink(link: string): number | null {
  const achado = link.match(/^\/conta-fixa\/(\d+)$/);
  return achado ? Number(achado[1]) : null;
}

function parcelaDoId(id: string): number | null {
  const achado = id.match(/^parcela-(\d+)$/);
  return achado ? Number(achado[1]) : null;
}

/** Próxima data `base + k × intervalo` (k ≥ 1) que ainda não passou, no horário. */
function proximoLembrete(base: Date, intervaloDias: number, hora: number, agora: Date): Date {
  let data = noHorario(addDays(base, intervaloDias), hora);
  while (data.getTime() <= agora.getTime()) data = noHorario(addDays(data, intervaloDias), hora);
  return data;
}

/**
 * Todas as notificações locais que devem estar agendadas agora, a partir dos dados: vencimentos
 * (agrupados quando caem no mesmo dia), fechamento de fatura, contas atrasadas, parcelas do
 * mês, fechamento do mês, resumo semanal e lembretes de importar e de backup. Só o futuro, em
 * ordem de data, até o limite do iOS; as seguintes entram no próximo reagendamento.
 */
export function planejarNotificacoes(entrada: EntradaDoPlanejamento): NotificacaoPlanejada[] {
  const { agora, config, lancamentos } = entrada;
  const planejadas: NotificacaoPlanejada[] = [];
  const hoje = startOfDay(agora);
  const cartoesPorId = new Map(entrada.cartoes.map((c) => [c.id, c]));
  // adiada com "Lembrar amanhã" continua valendo mesmo que o horário original já tenha passado
  const vale = (id: string, data: Date) => data.getTime() > agora.getTime() || id in entrada.adiamentos;

  // ---------------- vencimentos de contas fixas (fora do cartão) e faturas
  type Item = { lancamento: LancamentoDoPeriodo; tipo: TipoNotificacao };
  const pendentes: Item[] = [];
  for (const l of lancamentos) {
    if (l.status === 'pago') continue;
    if (l.tipo === 'conta_fixa' && !l.noCartao) {
      const contaFixaId = contaFixaDoLink(l.link);
      const daImportacao = contaFixaId !== null && entrada.contasFixasDaImportacao.has(contaFixaId);
      const tipo: TipoNotificacao = daImportacao ? 'recorrencia_importada' : 'vencimento_conta_fixa';
      if (config[tipo].ativo) pendentes.push({ lancamento: l, tipo });
    } else if (l.tipo === 'fatura' && config.vencimento_fatura.ativo && l.valor > 0) {
      pendentes.push({ lancamento: l, tipo: 'vencimento_fatura' });
    }
  }

  // um aviso por dia de disparo e tipo: 1 item = aviso com ação; vários = aviso agrupado
  const porDisparo = new Map<string, { data: Date; dias: number; itens: Item[]; grupo: 'conta' | 'fatura' }>();
  for (const item of pendentes) {
    const vencimento = dataDoIso(item.lancamento.data);
    const grupo: 'conta' | 'fatura' = item.tipo === 'vencimento_fatura' ? 'fatura' : 'conta';
    const tipoDaConfig = item.tipo === 'recorrencia_importada' ? 'vencimento_conta_fixa' : item.tipo;
    const diasAntes = config[tipoDaConfig].diasAntes ?? [0];
    for (const dias of diasAntes) {
      const disparo = noHorario(addDays(vencimento, -dias), config[item.tipo].hora);
      const idDoGrupo = `venc-grupo-${grupo}-${format(disparo, 'yyyy-MM-dd')}-${dias}`;
      if (!vale(`venc-${item.lancamento.id}-${dias}`, disparo) && !vale(idDoGrupo, disparo)) continue;
      const chave = `${grupo}|${format(disparo, "yyyy-MM-dd'T'HH")}|${dias}`;
      const atual = porDisparo.get(chave) ?? { data: disparo, dias, itens: [], grupo };
      atual.itens.push(item);
      porDisparo.set(chave, atual);
    }
  }
  for (const { data, dias, itens, grupo } of porDisparo.values()) {
    const mes = itens[0].lancamento.data.slice(0, 7);
    if (itens.length === 1) {
      const { lancamento: l, tipo } = itens[0];
      const cartaoId = l.cartaoId;
      const ehFatura = grupo === 'fatura';
      planejadas.push({
        id: `venc-${l.id}-${dias}`,
        tipo,
        titulo: `${l.descricao} vence ${quando(dias)}`,
        corpo: ehFatura ? `${formatarMoeda(l.valor)} previstos.` : `${formatarMoeda(l.valor)}. Toque para marcar como paga.`,
        data,
        categoria: ehFatura ? 'lembrete' : 'conta_fixa',
        url: ehFatura ? `/agenda?mes=${l.competencia}&item=fatura-${cartaoId}` : `/agenda?mes=${mes}&item=${l.id}`,
        parcelaId: ehFatura ? null : parcelaDoId(l.id),
      });
    } else {
      const total = itens.reduce((s, i) => s + i.lancamento.valor, 0);
      const nome = grupo === 'fatura' ? 'faturas vencem' : 'contas vencem';
      planejadas.push({
        id: `venc-grupo-${grupo}-${format(data, 'yyyy-MM-dd')}-${dias}`,
        tipo: grupo === 'fatura' ? 'vencimento_fatura' : 'vencimento_conta_fixa',
        titulo: `${itens.length} ${nome} ${quando(dias)}`,
        corpo: `${formatarMoeda(total)}: ${itens.map((i) => i.lancamento.descricao).join(', ')}.`,
        data,
        categoria: 'lembrete',
        url: `/agenda?mes=${mes}`,
        parcelaId: null,
      });
    }
  }

  // ---------------- fechamento da fatura
  if (config.fechamento_fatura.ativo) {
    for (const l of lancamentos) {
      if (l.tipo !== 'fatura' || l.status === 'pago' || l.cartaoId === null) continue;
      const cartao = cartoesPorId.get(l.cartaoId);
      if (!cartao) continue;
      const fechamento = dataDoIso(dataFechamentoDaFatura(l.competencia, cartao));
      for (const dias of config.fechamento_fatura.diasAntes ?? [2]) {
        const disparo = noHorario(addDays(fechamento, -dias), config.fechamento_fatura.hora);
        if (!vale(`fech-${l.id}-${dias}`, disparo)) continue;
        planejadas.push({
          id: `fech-${l.id}-${dias}`,
          tipo: 'fechamento_fatura',
          titulo: `Fatura do ${cartao.nome} fecha ${quando(dias)}`,
          corpo: `Até agora: ${formatarMoeda(l.valor)}. O que você comprar depois do fechamento fica para a fatura seguinte.`,
          data: disparo,
          categoria: 'lembrete',
          url: `/cartao/${cartao.id}`,
          parcelaId: null,
        });
      }
    }
  }

  // ---------------- conta atrasada: no dia seguinte ao vencimento
  if (config.conta_atrasada.ativo) {
    for (const l of lancamentos) {
      if (l.status === 'pago' || (l.tipo !== 'conta_fixa' && l.tipo !== 'fatura') || l.noCartao) continue;
      const disparo = noHorario(addDays(dataDoIso(l.data), 1), config.conta_atrasada.hora);
      if (!vale(`atraso-${l.id}`, disparo)) continue;
      const ehFatura = l.tipo === 'fatura';
      planejadas.push({
        id: `atraso-${l.id}`,
        tipo: 'conta_atrasada',
        titulo: `${l.descricao} venceu ontem`,
        corpo: `${formatarMoeda(l.valor)} ainda não ${ehFatura ? 'foi paga' : 'foi marcada como paga'}.`,
        data: disparo,
        categoria: ehFatura ? 'lembrete' : 'conta_fixa',
        url: ehFatura ? `/agenda?mes=${l.competencia}&item=fatura-${l.cartaoId}` : `/agenda?mes=${l.data.slice(0, 7)}&item=${l.id}`,
        parcelaId: ehFatura ? null : parcelaDoId(l.id),
      });
    }
  }

  // ---------------- dia 1º: parcelas do mês e fechamento do mês que terminou
  const primeiroDoProximo = noHorario(addMonths(new Date(hoje.getFullYear(), hoje.getMonth(), 1), 1), 9);
  const proximoMes = format(primeiroDoProximo, 'yyyy-MM');
  if (config.parcela_mes.ativo) {
    const doMes = lancamentos.filter((l) => l.tipo === 'parcela' && l.competencia === proximoMes);
    if (doMes.length > 0) {
      planejadas.push({
        id: `parcelas-${proximoMes}`,
        tipo: 'parcela_mes',
        titulo: `Parcelas de ${formatarMesReferencia(proximoMes).split(' ')[0]}`,
        corpo: `${doMes.length} ${doMes.length === 1 ? 'parcela' : 'parcelas'}, ${formatarMoeda(doMes.reduce((s, l) => s + l.valor, 0))} no total.`,
        data: noHorario(primeiroDoProximo, config.parcela_mes.hora),
        categoria: null,
        url: `/agenda?mes=${proximoMes}`,
        parcelaId: null,
      });
    }
  }
  if (config.fechamento_mes.ativo) {
    const mesQueTermina = format(hoje, 'yyyy-MM');
    planejadas.push({
      id: `fechamento-${mesQueTermina}`,
      tipo: 'fechamento_mes',
      titulo: `${formatarMesReferencia(mesQueTermina).split(' ')[0].replace(/^./, (c) => c.toUpperCase())} terminou`,
      corpo: 'Veja como foi o mês: o que deu certo, as categorias que passaram do previsto e o saldo que ficou.',
      data: noHorario(primeiroDoProximo, config.fechamento_mes.hora),
      categoria: null,
      url: '/fechamento-mes',
      parcelaId: null,
    });
  }

  // ---------------- resumo semanal: domingo
  if (config.resumo_semanal.ativo && entrada.resumoSemanal) {
    const diasAteDomingo = (7 - hoje.getDay()) % 7;
    let domingo = noHorario(addDays(hoje, diasAteDomingo), config.resumo_semanal.hora);
    if (domingo.getTime() <= agora.getTime()) domingo = noHorario(addDays(domingo, 7), config.resumo_semanal.hora);
    planejadas.push({
      id: `resumo-${format(domingo, 'yyyy-MM-dd')}`,
      tipo: 'resumo_semanal',
      titulo: 'Resumo da semana',
      corpo: entrada.resumoSemanal,
      data: domingo,
      categoria: null,
      url: '/relatorios',
      parcelaId: null,
    });
  }

  // ---------------- lembretes de importar e de backup
  if (config.lembrete_importacao.ativo) {
    const intervalo = config.lembrete_importacao.dias ?? 7;
    for (const ultima of entrada.ultimasImportacoes) {
      const data = proximoLembrete(dataDoIso(ultima.quando), intervalo, config.lembrete_importacao.hora, agora);
      const dias = Math.round((data.getTime() - dataDoIso(ultima.quando).getTime()) / 86400000);
      planejadas.push({
        id: `importar-${ultima.chave}`,
        tipo: 'lembrete_importacao',
        titulo: `Importe o extrato: ${ultima.nome}`,
        corpo: `Faz ${dias} dias que você não importa. Leva uns 2 minutos e mantém o saldo batendo com o banco.`,
        data,
        categoria: 'lembrete',
        url: '/importar-extrato',
        parcelaId: null,
      });
    }
  }
  if (config.lembrete_backup.ativo && entrada.referenciaBackup) {
    const intervalo = config.lembrete_backup.dias ?? 7;
    planejadas.push({
      id: 'backup',
      tipo: 'lembrete_backup',
      titulo: 'Faça um backup',
      corpo: 'Seus dados ficam só neste aparelho. Guarde uma cópia no iCloud Drive ou no Google Drive.',
      data: proximoLembrete(dataDoIso(entrada.referenciaBackup), intervalo, config.lembrete_backup.hora, agora),
      categoria: 'lembrete',
      url: '/backup',
      parcelaId: null,
    });
  }

  // "Lembrar amanhã": o adiado vale no lugar do original
  const ajustadas = planejadas.map((n) => {
    const adiada = entrada.adiamentos[n.id];
    return adiada ? { ...n, data: new Date(adiada) } : n;
  });

  return ajustadas
    .filter((n) => n.data.getTime() > agora.getTime())
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .slice(0, LIMITE_AGENDADAS);
}

/** Amanhã às 9h: para onde vai o "Lembrar amanhã". */
export function amanhaAsNove(agora: Date): Date {
  return noHorario(addDays(agora, 1), 9);
}

/**
 * Texto do resumo semanal: gasto da semana (segunda a hoje) em comparação com a média das 4
 * semanas anteriores, e a maior categoria. null quando não há gasto para comparar.
 */
export function textoDoResumoSemanal(
  lancamentos: Pick<LancamentoDoPeriodo, 'natureza' | 'data' | 'valor' | 'categoriaId'>[],
  agora: Date,
  nomeDaCategoria: (id: number | null) => string
): string | null {
  const hoje = startOfDay(agora);
  const diasDesdeSegunda = (hoje.getDay() + 6) % 7;
  const inicioDaSemana = addDays(hoje, -diasDesdeSegunda);
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');
  const despesas = lancamentos.filter((l) => l.natureza === 'despesa');
  const daSemana = despesas.filter((l) => l.data >= iso(inicioDaSemana) && l.data <= iso(addDays(inicioDaSemana, 6)));
  if (daSemana.length === 0) return null;
  const total = daSemana.reduce((s, l) => s + l.valor, 0);

  const semanasAnteriores = [1, 2, 3, 4].map((k) => {
    const inicio = addDays(inicioDaSemana, -7 * k);
    return despesas.filter((l) => l.data >= iso(inicio) && l.data <= iso(addDays(inicio, 6))).reduce((s, l) => s + l.valor, 0);
  });
  const comHistorico = semanasAnteriores.filter((v) => v > 0);
  const porCategoria = new Map<number | null, number>();
  for (const l of daSemana) porCategoria.set(l.categoriaId, (porCategoria.get(l.categoriaId) ?? 0) + l.valor);
  const [maiorId, maiorValor] = [...porCategoria].sort((a, b) => b[1] - a[1])[0];

  const partes = [`Você gastou ${formatarMoeda(total)} nesta semana`];
  if (comHistorico.length > 0) {
    const media = comHistorico.reduce((s, v) => s + v, 0) / comHistorico.length;
    const variacao = Math.round((total / media - 1) * 100);
    partes[0] += variacao === 0 ? ', igual à média' : `, ${Math.abs(variacao)}% ${variacao > 0 ? 'acima' : 'abaixo'} da média`;
  }
  partes.push(`Maior categoria: ${nomeDaCategoria(maiorId)} (${formatarMoeda(maiorValor)})`);
  return `${partes.join('. ')}.`;
}
