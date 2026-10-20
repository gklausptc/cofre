CREATE TABLE `contatos_pix` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome_normalizado` text NOT NULL,
	`apelido` text NOT NULL,
	`categoria_id` integer,
	`membro_id` integer,
	`tipo` text NOT NULL,
	`criado_em` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `regras_categorizacao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`padrao` text NOT NULL,
	`tipo_correspondencia` text DEFAULT 'contem' NOT NULL,
	`natureza` text DEFAULT 'ambas' NOT NULL,
	`categoria_id` integer,
	`membro_id` integer,
	`acao` text DEFAULT 'categorizar' NOT NULL,
	`conta_fixa_id` integer,
	`criada_em` text NOT NULL,
	`vezes_usada` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `importacoes` ADD `efeitos` text;