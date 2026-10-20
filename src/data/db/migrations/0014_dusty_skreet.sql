CREATE TABLE `orcamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoria_id` integer NOT NULL,
	`mes_inicio` text NOT NULL,
	`limite` integer NOT NULL,
	`apenas_no_mes` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `gastos_rapidos` ADD `comprovante` text;--> statement-breakpoint
ALTER TABLE `movimentacoes` ADD `comprovante` text;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `divisao_salario` text;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `salarios_divididos` text;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `insights_dispensados` text;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `alertas_enviados` text;