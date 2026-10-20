CREATE TABLE `importacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`arquivo` text NOT NULL,
	`formato` text NOT NULL,
	`banco` text,
	`conta_bancaria_id` integer,
	`cartao_id` integer,
	`periodo_inicio` text,
	`periodo_fim` text,
	`total_linhas` integer NOT NULL,
	`importadas` integer NOT NULL,
	`ignoradas` integer NOT NULL,
	`pendentes` integer DEFAULT 0 NOT NULL,
	`criada_em` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `gastos_rapidos` ADD `importacao_id` integer;--> statement-breakpoint
ALTER TABLE `gastos_rapidos` ADD `id_externo` text;--> statement-breakpoint
ALTER TABLE `movimentacoes` ADD `importacao_id` integer;--> statement-breakpoint
ALTER TABLE `movimentacoes` ADD `id_externo` text;