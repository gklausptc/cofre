/** Tipos de notificação local, cada um com liga/desliga em Configurações → Notificações. */
export type TipoNotificacao =
  | 'vencimento_conta_fixa'
  | 'vencimento_fatura'
  | 'fechamento_fatura'
  | 'parcela_mes'
  | 'recorrencia_importada'
  | 'conta_atrasada'
  | 'orcamento'
  | 'meta_cofrinho'
  | 'resumo_semanal'
  | 'fechamento_mes'
  | 'lembrete_importacao'
  | 'lembrete_backup';

export type ConfigDoTipo = {
  ativo: boolean;
  /** Dias antes do vencimento/fechamento (0 = no dia). */
  diasAntes?: number[];
  /** Hora do dia (8 a 21: nada de madrugada). */
  hora: number;
  /** Para lembretes: a cada quantos dias sem importar/fazer backup. */
  dias?: number;
};

export type ConfigNotificacoes = Record<TipoNotificacao, ConfigDoTipo>;

export const HORA_MINIMA = 8;
export const HORA_MAXIMA = 21;

export const CONFIG_PADRAO: ConfigNotificacoes = {
  vencimento_conta_fixa: { ativo: true, diasAntes: [2, 0], hora: 9 },
  vencimento_fatura: { ativo: true, diasAntes: [2, 0], hora: 9 },
  fechamento_fatura: { ativo: true, diasAntes: [2], hora: 9 },
  parcela_mes: { ativo: false, hora: 9 },
  recorrencia_importada: { ativo: true, hora: 9 },
  conta_atrasada: { ativo: true, hora: 10 },
  orcamento: { ativo: true, hora: 9 },
  meta_cofrinho: { ativo: true, hora: 9 },
  resumo_semanal: { ativo: false, hora: 19 },
  fechamento_mes: { ativo: true, hora: 9 },
  lembrete_importacao: { ativo: true, hora: 19, dias: 7 },
  lembrete_backup: { ativo: true, hora: 20, dias: 7 },
};

export const DESCRICAO_DOS_TIPOS: Record<TipoNotificacao, { titulo: string; descricao: string }> = {
  vencimento_conta_fixa: { titulo: 'Vencimento de conta fixa', descricao: 'Antes e no dia do vencimento, se ainda não estiver paga.' },
  vencimento_fatura: { titulo: 'Vencimento da fatura', descricao: 'Com o valor previsto da fatura.' },
  fechamento_fatura: { titulo: 'Fechamento da fatura', descricao: 'Para conferir as compras antes de fechar.' },
  parcela_mes: { titulo: 'Parcelas do mês', descricao: 'No dia 1º, quantas parcelas caem no mês e quanto somam.' },
  recorrencia_importada: { titulo: 'Contas fixas criadas na importação', descricao: 'Os vencimentos das cobranças que viraram conta fixa.' },
  conta_atrasada: { titulo: 'Conta atrasada', descricao: 'No dia seguinte ao vencimento, se não foi marcada como paga.' },
  orcamento: { titulo: 'Orçamento da categoria', descricao: 'Ao chegar em 80% e em 100% do limite.' },
  meta_cofrinho: { titulo: 'Meta de cofrinho', descricao: 'Ao chegar em 25%, 50%, 75% e 100% da meta.' },
  resumo_semanal: { titulo: 'Resumo semanal', descricao: 'Domingo às 19h: gasto da semana e a maior categoria.' },
  fechamento_mes: { titulo: 'Fechamento do mês', descricao: 'No dia 1º, para ver como foi o mês que terminou.' },
  lembrete_importacao: { titulo: 'Lembrete de importar o extrato', descricao: 'Quando passar do prazo sem importar uma conta ou cartão.' },
  lembrete_backup: { titulo: 'Lembrete de backup', descricao: 'Quando passar do prazo sem fazer backup.' },
};

/** Junta o que foi salvo com o padrão (tipos novos entram ligados como no padrão). */
export function lerConfigNotificacoes(json: string | null): ConfigNotificacoes {
  if (!json) return CONFIG_PADRAO;
  try {
    const salvo = JSON.parse(json) as Partial<Record<TipoNotificacao, Partial<ConfigDoTipo>>>;
    const config = { ...CONFIG_PADRAO };
    for (const tipo of Object.keys(CONFIG_PADRAO) as TipoNotificacao[]) {
      const parcial = salvo[tipo];
      if (!parcial) continue;
      const hora = typeof parcial.hora === 'number' ? Math.min(HORA_MAXIMA, Math.max(HORA_MINIMA, Math.round(parcial.hora))) : undefined;
      config[tipo] = { ...CONFIG_PADRAO[tipo], ...parcial, ...(hora !== undefined ? { hora } : {}) };
    }
    return config;
  } catch {
    return CONFIG_PADRAO;
  }
}

/** Notificações adiadas ("Lembrar amanhã"): identificador → quando mostrar de novo (ISO). */
export type Adiamentos = Record<string, string>;

export function lerAdiamentos(json: string | null, agora: Date): Adiamentos {
  if (!json) return {};
  try {
    const todos = JSON.parse(json) as Adiamentos;
    return Object.fromEntries(Object.entries(todos).filter(([, quando]) => new Date(quando).getTime() > agora.getTime()));
  } catch {
    return {};
  }
}
