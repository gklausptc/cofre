CREATE TABLE `preferencias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tema` text DEFAULT 'sistema' NOT NULL,
	`bloqueio_ativo` integer DEFAULT false NOT NULL,
	`biometria_ativa` integer DEFAULT false NOT NULL,
	`tutorial_concluido` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `movimentacoes` ADD `recorrente` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `movimentacoes` ADD `recorrente_origem_id` integer;