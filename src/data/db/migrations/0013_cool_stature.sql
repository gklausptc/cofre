ALTER TABLE `preferencias` ADD `config_notificacoes` text;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `adiamentos_notificacoes` text;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `permissao_notificacoes_pedida` integer DEFAULT false NOT NULL;