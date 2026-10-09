CREATE TABLE `aportes_cofrinho` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cofrinho_id` integer NOT NULL,
	`valor` real NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cartoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`limite` real NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`cor` text NOT NULL,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `categorias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`icone` text NOT NULL,
	`cor` text NOT NULL,
	`tipo` text NOT NULL,
	`is_padrao` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `cofrinhos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`valor_meta` real NOT NULL,
	`data_meta` text,
	`cor` text NOT NULL,
	`icone` text NOT NULL,
	`status` text DEFAULT 'ativo'
);
--> statement-breakpoint
CREATE TABLE `compras_parceladas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`descricao` text NOT NULL,
	`valor_total` real NOT NULL,
	`num_parcelas` integer NOT NULL,
	`cartao_id` integer NOT NULL,
	`categoria_id` integer,
	`data_compra` text NOT NULL,
	`membro_id` integer,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `contas_bancarias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`banco` text NOT NULL,
	`nome_conta` text NOT NULL,
	`saldo_inicial` real DEFAULT 0 NOT NULL,
	`cor` text NOT NULL,
	`icone` text NOT NULL,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `contas_fixas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`categoria_id` integer,
	`valor` real NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`forma_pagamento` text NOT NULL,
	`conta_bancaria_id` integer,
	`cartao_id` integer,
	`recorrencia` text NOT NULL,
	`data_inicio` text NOT NULL,
	`data_fim` text,
	`membro_id` integer,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `faturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cartao_id` integer NOT NULL,
	`mes_referencia` text NOT NULL,
	`data_fechamento` text NOT NULL,
	`data_vencimento` text NOT NULL,
	`status` text DEFAULT 'aberta'
);
--> statement-breakpoint
CREATE TABLE `gastos_rapidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`valor` real NOT NULL,
	`categoria_id` integer,
	`descricao` text,
	`data` text NOT NULL,
	`forma_pagamento` text NOT NULL,
	`conta_bancaria_id` integer,
	`cartao_id` integer,
	`membro_id` integer
);
--> statement-breakpoint
CREATE TABLE `membros_familia` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor` text NOT NULL,
	`icone` text NOT NULL,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `metas_financeiras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`valor_meta` real NOT NULL,
	`valor_atual` real DEFAULT 0 NOT NULL,
	`data_meta` text,
	`categoria` text
);
--> statement-breakpoint
CREATE TABLE `movimentacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conta_bancaria_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`valor` real NOT NULL,
	`data` text NOT NULL,
	`descricao` text,
	`categoria_id` integer,
	`conta_destino_id` integer,
	`origem` text DEFAULT 'manual',
	`membro_id` integer
);
--> statement-breakpoint
CREATE TABLE `parcelas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`compra_parcelada_id` integer,
	`conta_fixa_id` integer,
	`numero` integer NOT NULL,
	`valor` real NOT NULL,
	`mes_referencia` text NOT NULL,
	`fatura_id` integer,
	`status` text DEFAULT 'pendente',
	`data_pagamento` text
);
--> statement-breakpoint
CREATE TABLE `reserva_emergencia` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`valor_meta` real NOT NULL,
	`valor_atual` real DEFAULT 0 NOT NULL,
	`meses_cobertura_desejados` integer
);
