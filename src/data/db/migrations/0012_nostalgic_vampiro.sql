CREATE TABLE `perguntas_pendentes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`importacao_id` integer,
	`tipo` text NOT NULL,
	`chave` text NOT NULL,
	`titulo` text NOT NULL,
	`pista` text NOT NULL,
	`valor` integer DEFAULT 0 NOT NULL,
	`quantidade` integer DEFAULT 1 NOT NULL,
	`dados` text NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`criada_em` text NOT NULL,
	`respondida_em` text
);
