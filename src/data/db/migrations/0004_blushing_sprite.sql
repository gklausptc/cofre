ALTER TABLE `faturas` ADD `conta_bancaria_id` integer;--> statement-breakpoint
ALTER TABLE `faturas` ADD `valor_pago` real;--> statement-breakpoint
ALTER TABLE `faturas` ADD `data_pagamento` text;--> statement-breakpoint
ALTER TABLE `gastos_rapidos` ADD `valor_original` real;--> statement-breakpoint
ALTER TABLE `gastos_rapidos` ADD `justificativa_alteracao` text;--> statement-breakpoint
ALTER TABLE `parcelas` ADD `valor_original` real;--> statement-breakpoint
ALTER TABLE `parcelas` ADD `justificativa_alteracao` text;