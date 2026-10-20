ALTER TABLE `cofrinhos` ADD `indexador` text DEFAULT 'nenhum' NOT NULL;--> statement-breakpoint
ALTER TABLE `cofrinhos` ADD `percentual_indexador` integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE `cofrinhos` ADD `cobra_ir` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `taxa_cdi_anual` integer;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `taxa_selic_anual` integer;--> statement-breakpoint
ALTER TABLE `preferencias` ADD `taxas_atualizadas_em` text;--> statement-breakpoint
ALTER TABLE `reserva_emergencia` ADD `indexador` text DEFAULT 'nenhum' NOT NULL;--> statement-breakpoint
ALTER TABLE `reserva_emergencia` ADD `percentual_indexador` integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE `reserva_emergencia` ADD `cobra_ir` integer DEFAULT false NOT NULL;