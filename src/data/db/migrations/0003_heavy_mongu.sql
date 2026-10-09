CREATE TABLE `movimentacoes_reserva` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`valor` real NOT NULL,
	`data` text NOT NULL,
	`justificativa` text
);
