import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const membrosFamilia = sqliteTable('membros_familia', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  cor: text('cor').notNull(),
  icone: text('icone').notNull(),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
});

export const categorias = sqliteTable('categorias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  icone: text('icone').notNull(),
  cor: text('cor').notNull(),
  tipo: text('tipo', { enum: ['receita', 'despesa'] }).notNull(),
  isPadrao: integer('is_padrao', { mode: 'boolean' }).default(false),
});

export const contasBancarias = sqliteTable('contas_bancarias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  banco: text('banco').notNull(),
  nomeConta: text('nome_conta').notNull(),
  saldoInicial: real('saldo_inicial').notNull().default(0),
  cor: text('cor').notNull(),
  icone: text('icone').notNull(),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
  // saldo_atual NÃO é coluna — é sempre calculado a partir de movimentacoes (ver usecases)
});

export const movimentacoes = sqliteTable('movimentacoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contaBancariaId: integer('conta_bancaria_id').notNull(),
  tipo: text('tipo', { enum: ['entrada', 'saida', 'transferencia'] }).notNull(),
  valor: real('valor').notNull(),
  data: text('data').notNull(), // ISO date
  descricao: text('descricao'),
  categoriaId: integer('categoria_id'),
  contaDestinoId: integer('conta_destino_id'), // só para transferencia
  origem: text('origem', { enum: ['manual', 'conta_fixa', 'gasto', 'parcela'] }).default('manual'),
  membroId: integer('membro_id'),
  // só se aplica a entradas: exclui o valor do resumo do mês em que caiu e soma no mês seguinte
  reservarProximoMes: integer('reservar_proximo_mes', { mode: 'boolean' }).default(false),
  // entrada que se repete todo mês (ex.: salário) — a própria linha marcada `recorrente`
  // é o "modelo"; as cópias geradas automaticamente apontam pra ela via recorrenteOrigemId
  recorrente: integer('recorrente', { mode: 'boolean' }).default(false),
  recorrenteOrigemId: integer('recorrente_origem_id'),
});

export const cartoes = sqliteTable('cartoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  limite: real('limite').notNull(),
  diaFechamento: integer('dia_fechamento').notNull(),
  diaVencimento: integer('dia_vencimento').notNull(),
  cor: text('cor').notNull(),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
});

export const faturas = sqliteTable('faturas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cartaoId: integer('cartao_id').notNull(),
  mesReferencia: text('mes_referencia').notNull(), // 'YYYY-MM'
  dataFechamento: text('data_fechamento').notNull(),
  dataVencimento: text('data_vencimento').notNull(),
  status: text('status', { enum: ['aberta', 'fechada', 'paga'] }).default('aberta'),
  // preenchidos ao pagar a fatura: de qual conta saiu o dinheiro e quanto foi pago
  contaBancariaId: integer('conta_bancaria_id'),
  valorPago: real('valor_pago'),
  dataPagamento: text('data_pagamento'),
  // valor_total NÃO é coluna — calculado a partir da soma das parcelas vinculadas
});

export const comprasParceladas = sqliteTable('compras_parceladas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  descricao: text('descricao').notNull(),
  valorTotal: real('valor_total').notNull(),
  numParcelas: integer('num_parcelas').notNull(),
  cartaoId: integer('cartao_id').notNull(),
  categoriaId: integer('categoria_id'),
  dataCompra: text('data_compra').notNull(),
  membroId: integer('membro_id'),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
});

export const parcelas = sqliteTable('parcelas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  compraParceladaId: integer('compra_parcelada_id'), // nullable
  contaFixaId: integer('conta_fixa_id'), // nullable — exatamente um dos dois deve ser preenchido
  numero: integer('numero').notNull(), // 1, 2, 3...
  valor: real('valor').notNull(),
  mesReferencia: text('mes_referencia').notNull(), // 'YYYY-MM'
  faturaId: integer('fatura_id'),
  status: text('status', { enum: ['pendente', 'paga'] }).default('pendente'),
  dataPagamento: text('data_pagamento'),
  // quando o valor é alterado: o valor de antes e o motivo (obrigatório na tela)
  valorOriginal: real('valor_original'),
  justificativaAlteracao: text('justificativa_alteracao'),
});

export const contasFixas = sqliteTable('contas_fixas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  categoriaId: integer('categoria_id'),
  valor: real('valor').notNull(),
  diaVencimento: integer('dia_vencimento').notNull(),
  formaPagamento: text('forma_pagamento', { enum: ['debito', 'pix', 'cartao', 'boleto'] }).notNull(),
  contaBancariaId: integer('conta_bancaria_id'),
  cartaoId: integer('cartao_id'),
  recorrencia: text('recorrencia', {
    enum: ['mensal', 'quinzenal', 'semanal', 'anual', 'unica'],
  }).notNull(),
  dataInicio: text('data_inicio').notNull(),
  dataFim: text('data_fim'),
  membroId: integer('membro_id'),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
});

export const gastosRapidos = sqliteTable('gastos_rapidos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  valor: real('valor').notNull(),
  categoriaId: integer('categoria_id'),
  descricao: text('descricao'),
  data: text('data').notNull(),
  formaPagamento: text('forma_pagamento', { enum: ['debito', 'pix', 'cartao', 'dinheiro'] }).notNull(),
  contaBancariaId: integer('conta_bancaria_id'),
  cartaoId: integer('cartao_id'),
  membroId: integer('membro_id'),
  valorOriginal: real('valor_original'),
  justificativaAlteracao: text('justificativa_alteracao'),
});

export const cofrinhos = sqliteTable('cofrinhos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  valorMeta: real('valor_meta').notNull(),
  dataMeta: text('data_meta'),
  cor: text('cor').notNull(),
  icone: text('icone').notNull(),
  status: text('status', { enum: ['ativo', 'concluido'] }).default('ativo'),
  // valor_atual NÃO é coluna — calculado pela soma de aportes_cofrinho
});

export const aportesCofrinho = sqliteTable('aportes_cofrinho', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cofrinhoId: integer('cofrinho_id').notNull(),
  valor: real('valor').notNull(),
  data: text('data').notNull(),
});

export const reservaEmergencia = sqliteTable('reserva_emergencia', {
  id: integer('id').primaryKey({ autoIncrement: true }), // singleton, sempre id=1
  valorMeta: real('valor_meta').notNull(),
  valorAtual: real('valor_atual').notNull().default(0),
  mesesCoberturaDesejados: integer('meses_cobertura_desejados'),
});

export const movimentacoesReserva = sqliteTable('movimentacoes_reserva', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tipo: text('tipo', { enum: ['aporte', 'retirada'] }).notNull(),
  valor: real('valor').notNull(),
  data: text('data').notNull(),
  justificativa: text('justificativa'), // obrigatória apenas para retirada, validado na tela
});

export const metasFinanceiras = sqliteTable('metas_financeiras', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  valorMeta: real('valor_meta').notNull(),
  valorAtual: real('valor_atual').notNull().default(0),
  dataMeta: text('data_meta'),
  categoria: text('categoria'),
});

export const preferencias = sqliteTable('preferencias', {
  id: integer('id').primaryKey({ autoIncrement: true }), // singleton, sempre id=1
  tema: text('tema', { enum: ['sistema', 'claro', 'escuro'] }).notNull().default('sistema'),
  // o PIN em si fica no SecureStore (fora do SQLite) — aqui só a flag de se está ativo
  bloqueioAtivo: integer('bloqueio_ativo', { mode: 'boolean' }).notNull().default(false),
  biometriaAtiva: integer('biometria_ativa', { mode: 'boolean' }).notNull().default(false),
  tutorialConcluido: integer('tutorial_concluido', { mode: 'boolean' }).notNull().default(false),
});
