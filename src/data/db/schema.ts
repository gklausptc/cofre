import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Dinheiro é sempre gravado em CENTAVOS inteiros (R$ 12,34 = 1234), nunca em reais com
// casas decimais — evita erro de arredondamento de ponto flutuante nas somas. A conversão
// para exibição fica em src/core/utils/currency.ts.

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
  saldoInicial: integer('saldo_inicial').notNull().default(0),
  cor: text('cor').notNull(),
  icone: text('icone').notNull(),
  ativo: integer('ativo', { mode: 'boolean' }).default(true),
  // banco|agência|conta|tipo lido do extrato: liga os próximos arquivos a esta conta sozinho
  identificadorExtrato: text('identificador_extrato'),
  // saldo_atual NÃO é coluna — é sempre calculado a partir de movimentacoes (ver usecases)
});

export const movimentacoes = sqliteTable('movimentacoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contaBancariaId: integer('conta_bancaria_id').notNull(),
  tipo: text('tipo', { enum: ['entrada', 'saida', 'transferencia'] }).notNull(),
  valor: integer('valor').notNull(),
  data: text('data').notNull(), // ISO date
  descricao: text('descricao'),
  categoriaId: integer('categoria_id'),
  contaDestinoId: integer('conta_destino_id'), // só para transferencia
  // 'interna': dinheiro que veio (ou foi) para uma conta sua fora do app — poupança, caixinha,
  // PIX para o próprio nome. Mexe no saldo, mas não é receita nem despesa (ehMovimentoInterno).
  origem: text('origem', { enum: ['manual', 'conta_fixa', 'gasto', 'parcela', 'fatura', 'interna'] }).default('manual'),
  membroId: integer('membro_id'),
  // só se aplica a entradas: exclui o valor do resumo do mês em que caiu e soma no mês seguinte
  reservarProximoMes: integer('reservar_proximo_mes', { mode: 'boolean' }).default(false),
  // entrada que se repete todo mês (ex.: salário) — a própria linha marcada `recorrente`
  // é o "modelo"; as cópias geradas automaticamente apontam pra ela via recorrenteOrigemId
  recorrente: integer('recorrente', { mode: 'boolean' }).default(false),
  recorrenteOrigemId: integer('recorrente_origem_id'),
  // Pagamento de um compromisso: a fatura paga (origem 'fatura') ou a ocorrência de conta
  // fixa paga (origem 'conta_fixa', ligada à parcela). Desconta do saldo da conta, mas não
  // entra como despesa nos relatórios: a despesa já é contada pela fatura/conta fixa.
  faturaId: integer('fatura_id'),
  parcelaId: integer('parcela_id'),
  // Veio de um extrato importado: qual importação (para desfazer) e o id da linha no banco
  // (FITID do OFX ou hash da linha do CSV), para nunca importar a mesma linha duas vezes.
  importacaoId: integer('importacao_id'),
  idExterno: text('id_externo'),
  // foto do comprovante, guardada em documentDirectory/comprovantes (caminho relativo)
  comprovante: text('comprovante'),
});

export const cartoes = sqliteTable('cartoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  limite: integer('limite').notNull(),
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
  valorPago: integer('valor_pago'),
  dataPagamento: text('data_pagamento'),
  // valor_total NÃO é coluna — calculado a partir da soma das parcelas vinculadas
});

export const comprasParceladas = sqliteTable('compras_parceladas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  descricao: text('descricao').notNull(),
  valorTotal: integer('valor_total').notNull(),
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
  valor: integer('valor').notNull(),
  mesReferencia: text('mes_referencia').notNull(), // 'YYYY-MM'
  faturaId: integer('fatura_id'),
  status: text('status', { enum: ['pendente', 'paga'] }).default('pendente'),
  dataPagamento: text('data_pagamento'),
  // quando o valor é alterado: o valor de antes e o motivo (obrigatório na tela)
  valorOriginal: integer('valor_original'),
  justificativaAlteracao: text('justificativa_alteracao'),
});

export const contasFixas = sqliteTable('contas_fixas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  categoriaId: integer('categoria_id'),
  valor: integer('valor').notNull(),
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
  valor: integer('valor').notNull(),
  categoriaId: integer('categoria_id'),
  descricao: text('descricao'),
  data: text('data').notNull(),
  formaPagamento: text('forma_pagamento', { enum: ['debito', 'pix', 'cartao', 'dinheiro'] }).notNull(),
  contaBancariaId: integer('conta_bancaria_id'),
  cartaoId: integer('cartao_id'),
  membroId: integer('membro_id'),
  valorOriginal: integer('valor_original'),
  justificativaAlteracao: text('justificativa_alteracao'),
  // Veio de um extrato importado: qual importação (para desfazer) e o id da linha no banco
  // (FITID do OFX ou hash da linha do CSV), para nunca importar a mesma linha duas vezes.
  importacaoId: integer('importacao_id'),
  idExterno: text('id_externo'),
  // foto do comprovante, guardada em documentDirectory/comprovantes (caminho relativo)
  comprovante: text('comprovante'),
});

export const cofrinhos = sqliteTable('cofrinhos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  valorMeta: integer('valor_meta').notNull(),
  dataMeta: text('data_meta'),
  cor: text('cor').notNull(),
  icone: text('icone').notNull(),
  status: text('status', { enum: ['ativo', 'concluido'] }).default('ativo'),
  // Rendimento (estimado): onde o dinheiro está aplicado. percentual_indexador em centésimos
  // (10500 = 105% do CDI); cobra_ir = tabela regressiva do IR (CDB/Tesouro; LCI/LCA não cobram).
  indexador: text('indexador', { enum: ['nenhum', 'cdi', 'selic', 'poupanca'] }).notNull().default('nenhum'),
  percentualIndexador: integer('percentual_indexador').notNull().default(10000),
  cobraIr: integer('cobra_ir', { mode: 'boolean' }).notNull().default(false),
  // valor_atual NÃO é coluna — calculado pela soma de aportes_cofrinho
});

export const aportesCofrinho = sqliteTable('aportes_cofrinho', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cofrinhoId: integer('cofrinho_id').notNull(),
  valor: integer('valor').notNull(),
  data: text('data').notNull(),
});

export const reservaEmergencia = sqliteTable('reserva_emergencia', {
  id: integer('id').primaryKey({ autoIncrement: true }), // singleton, sempre id=1
  valorMeta: integer('valor_meta').notNull(),
  // valor_atual NÃO é coluna — calculado pelo histórico de movimentacoes_reserva (saldoReserva.ts)
  mesesCoberturaDesejados: integer('meses_cobertura_desejados'),
  // Rendimento (estimado): onde o dinheiro está aplicado. percentual_indexador em centésimos
  // (10500 = 105% do CDI); cobra_ir = tabela regressiva do IR (CDB/Tesouro; LCI/LCA não cobram).
  indexador: text('indexador', { enum: ['nenhum', 'cdi', 'selic', 'poupanca'] }).notNull().default('nenhum'),
  percentualIndexador: integer('percentual_indexador').notNull().default(10000),
  cobraIr: integer('cobra_ir', { mode: 'boolean' }).notNull().default(false),
});

export const movimentacoesReserva = sqliteTable('movimentacoes_reserva', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tipo: text('tipo', { enum: ['aporte', 'retirada'] }).notNull(),
  valor: integer('valor').notNull(),
  data: text('data').notNull(),
  justificativa: text('justificativa'), // obrigatória apenas para retirada, validado na tela
});

export const metasFinanceiras = sqliteTable('metas_financeiras', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nome: text('nome').notNull(),
  valorMeta: integer('valor_meta').notNull(),
  valorAtual: integer('valor_atual').notNull().default(0),
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
  // quando o último backup foi compartilhado para fora do app (ISO com hora); null = nunca
  ultimoBackupEm: text('ultimo_backup_em'),
  // Taxas de referência para o rendimento estimado, digitadas pelo usuário (o app não tem
  // internet). Centésimos de % ao ano: 1490 = 14,90% a.a. null = ainda não informada.
  taxaCdiAnual: integer('taxa_cdi_anual'),
  taxaSelicAnual: integer('taxa_selic_anual'),
  taxasAtualizadasEm: text('taxas_atualizadas_em'),
  // Notificações: configuração por tipo (JSON de ConfigNotificacoes; null = padrão), os
  // "Lembrar amanhã" pendentes (JSON id → ISO) e se a permissão já foi pedida (o pedido é
  // feito na primeira conta fixa, não na abertura do app).
  configNotificacoes: text('config_notificacoes'),
  adiamentosNotificacoes: text('adiamentos_notificacoes'),
  permissaoNotificacoesPedida: integer('permissao_notificacoes_pedida', { mode: 'boolean' }).notNull().default(false),
  // Divisão automática do salário: JSON de DivisaoDoSalario (percentuais para reserva e
  // cofrinhos; null = não configurada) e os ids das entradas de salário já divididas.
  divisaoSalario: text('divisao_salario'),
  salariosDivididos: text('salarios_divididos'),
  // insights do Início dispensados com "Entendi" (JSON de chaves; voltam se a situação mudar)
  insightsDispensados: text('insights_dispensados'),
  // avisos de orçamento já mandados (JSON de chaves "categoria-mês-80/100"), para avisar uma vez
  alertasEnviados: text('alertas_enviados'),
  // nomes do titular como aparecem nos extratos (JSON), para reconhecer PIX e transferências
  // entre contas suas; o app aprende pelo cabeçalho do extrato ("Cliente: ...")
  nomesProprios: text('nomes_proprios'),
});

// Orçamento por categoria: limite mensal em centavos. Vale de `mes_inicio` em diante (o mais
// recente com mes_inicio ≤ mês); com `apenas_no_mes`, só naquele mês e com prioridade. Assim,
// mudar o limite a partir de um mês não reescreve os meses anteriores (ver orcamentoDoMes).
export const orcamentos = sqliteTable('orcamentos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoriaId: integer('categoria_id').notNull(),
  mesInicio: text('mes_inicio').notNull(),
  limite: integer('limite').notNull(),
  apenasNoMes: integer('apenas_no_mes', { mode: 'boolean' }).notNull().default(false),
});

export const importacoes = sqliteTable('importacoes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  arquivo: text('arquivo').notNull(),
  formato: text('formato', { enum: ['ofx', 'csv', 'txt', 'pdf'] }).notNull(),
  banco: text('banco'),
  contaBancariaId: integer('conta_bancaria_id'),
  cartaoId: integer('cartao_id'),
  periodoInicio: text('periodo_inicio'),
  periodoFim: text('periodo_fim'),
  totalLinhas: integer('total_linhas').notNull(),
  importadas: integer('importadas').notNull(),
  ignoradas: integer('ignoradas').notNull(),
  pendentes: integer('pendentes').notNull().default(0),
  criadaEm: text('criada_em').notNull(),
  // O que a importação mudou fora das próprias linhas (contas fixas e faturas pagas,
  // lançamentos convertidos em transferência), com o estado de antes, em JSON: é o que
  // permite desfazer a importação inteira (ver EfeitosDaImportacao).
  efeitos: text('efeitos'),
});

// Regras aprendidas na importação: "o que tiver este texto vai para esta categoria" (ou é
// transferência própria, empréstimo, conta fixa, ou deve ser ignorado). `padrao` é a
// descrição já normalizada (normalizarDescricao).
export const regrasCategorizacao = sqliteTable('regras_categorizacao', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  padrao: text('padrao').notNull(),
  tipoCorrespondencia: text('tipo_correspondencia', { enum: ['exato', 'contem', 'comeca_com'] })
    .notNull()
    .default('contem'),
  // vale para saídas (despesa), entradas (receita) ou as duas
  natureza: text('natureza', { enum: ['despesa', 'receita', 'ambas'] }).notNull().default('ambas'),
  categoriaId: integer('categoria_id'),
  membroId: integer('membro_id'),
  acao: text('acao', { enum: ['categorizar', 'ignorar', 'transferencia_propria', 'conta_fixa', 'emprestimo'] })
    .notNull()
    .default('categorizar'),
  contaFixaId: integer('conta_fixa_id'),
  criadaEm: text('criada_em').notNull(),
  vezesUsada: integer('vezes_usada').notNull().default(0),
});

// Perguntas que sobraram de uma importação, para responder depois (tela Revisão). `chave`
// junta perguntas iguais entre importações (5 PIX para a mesma pessoa = 1 pergunta);
// `dados` é o JSON de DadosDaPergunta (src/domain/types/perguntas.ts), com as linhas afetadas.
export const perguntasPendentes = sqliteTable('perguntas_pendentes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  importacaoId: integer('importacao_id'),
  tipo: text('tipo', { enum: ['categoria', 'pix_pessoa', 'parcelamento', 'recorrencia', 'duplicidade'] }).notNull(),
  chave: text('chave').notNull(),
  titulo: text('titulo').notNull(),
  pista: text('pista').notNull(),
  // impacto em centavos (soma das linhas), para ordenar a fila
  valor: integer('valor').notNull().default(0),
  quantidade: integer('quantidade').notNull().default(1),
  dados: text('dados').notNull(),
  status: text('status', { enum: ['pendente', 'respondida'] }).notNull().default('pendente'),
  criadaEm: text('criada_em').notNull(),
  respondidaEm: text('respondida_em'),
});

// Quem é quem nos PIX: o nome como vem no extrato (normalizado) e o que ele representa.
export const contatosPix = sqliteTable('contatos_pix', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nomeNormalizado: text('nome_normalizado').notNull(),
  apelido: text('apelido').notNull(),
  categoriaId: integer('categoria_id'),
  membroId: integer('membro_id'),
  tipo: text('tipo', { enum: ['pessoa', 'familia', 'servico', 'emprestimo', 'propria'] }).notNull(),
  criadoEm: text('criado_em').notNull(),
});
