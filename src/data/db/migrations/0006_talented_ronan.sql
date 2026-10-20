-- Dinheiro de reais (real) para centavos inteiros: cada tabela é recriada com as colunas
-- monetárias em integer e os valores convertidos com ROUND(valor * 100). O contador de ids
-- (sqlite_sequence) de cada tabela é preservado, para nunca reaproveitar um id já usado.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_aportes_cofrinho` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cofrinho_id` integer NOT NULL,
	`valor` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_aportes_cofrinho`("id", "cofrinho_id", "valor", "data") SELECT "id", "cofrinho_id", CAST(ROUND("valor" * 100) AS INTEGER), "data" FROM `aportes_cofrinho`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_aportes_cofrinho', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_aportes_cofrinho');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('aportes_cofrinho', '__new_aportes_cofrinho')) WHERE name = '__new_aportes_cofrinho';--> statement-breakpoint
DROP TABLE `aportes_cofrinho`;--> statement-breakpoint
ALTER TABLE `__new_aportes_cofrinho` RENAME TO `aportes_cofrinho`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_cartoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`limite` integer NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`cor` text NOT NULL,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
INSERT INTO `__new_cartoes`("id", "nome", "limite", "dia_fechamento", "dia_vencimento", "cor", "ativo") SELECT "id", "nome", CAST(ROUND("limite" * 100) AS INTEGER), "dia_fechamento", "dia_vencimento", "cor", "ativo" FROM `cartoes`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_cartoes', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_cartoes');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('cartoes', '__new_cartoes')) WHERE name = '__new_cartoes';--> statement-breakpoint
DROP TABLE `cartoes`;--> statement-breakpoint
ALTER TABLE `__new_cartoes` RENAME TO `cartoes`;--> statement-breakpoint
CREATE TABLE `__new_cofrinhos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`valor_meta` integer NOT NULL,
	`data_meta` text,
	`cor` text NOT NULL,
	`icone` text NOT NULL,
	`status` text DEFAULT 'ativo'
);
--> statement-breakpoint
INSERT INTO `__new_cofrinhos`("id", "nome", "valor_meta", "data_meta", "cor", "icone", "status") SELECT "id", "nome", CAST(ROUND("valor_meta" * 100) AS INTEGER), "data_meta", "cor", "icone", "status" FROM `cofrinhos`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_cofrinhos', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_cofrinhos');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('cofrinhos', '__new_cofrinhos')) WHERE name = '__new_cofrinhos';--> statement-breakpoint
DROP TABLE `cofrinhos`;--> statement-breakpoint
ALTER TABLE `__new_cofrinhos` RENAME TO `cofrinhos`;--> statement-breakpoint
CREATE TABLE `__new_compras_parceladas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`descricao` text NOT NULL,
	`valor_total` integer NOT NULL,
	`num_parcelas` integer NOT NULL,
	`cartao_id` integer NOT NULL,
	`categoria_id` integer,
	`data_compra` text NOT NULL,
	`membro_id` integer,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
INSERT INTO `__new_compras_parceladas`("id", "descricao", "valor_total", "num_parcelas", "cartao_id", "categoria_id", "data_compra", "membro_id", "ativo") SELECT "id", "descricao", CAST(ROUND("valor_total" * 100) AS INTEGER), "num_parcelas", "cartao_id", "categoria_id", "data_compra", "membro_id", "ativo" FROM `compras_parceladas`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_compras_parceladas', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_compras_parceladas');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('compras_parceladas', '__new_compras_parceladas')) WHERE name = '__new_compras_parceladas';--> statement-breakpoint
DROP TABLE `compras_parceladas`;--> statement-breakpoint
ALTER TABLE `__new_compras_parceladas` RENAME TO `compras_parceladas`;--> statement-breakpoint
CREATE TABLE `__new_contas_bancarias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`banco` text NOT NULL,
	`nome_conta` text NOT NULL,
	`saldo_inicial` integer DEFAULT 0 NOT NULL,
	`cor` text NOT NULL,
	`icone` text NOT NULL,
	`ativo` integer DEFAULT true
);
--> statement-breakpoint
INSERT INTO `__new_contas_bancarias`("id", "banco", "nome_conta", "saldo_inicial", "cor", "icone", "ativo") SELECT "id", "banco", "nome_conta", CAST(ROUND("saldo_inicial" * 100) AS INTEGER), "cor", "icone", "ativo" FROM `contas_bancarias`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_contas_bancarias', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_contas_bancarias');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('contas_bancarias', '__new_contas_bancarias')) WHERE name = '__new_contas_bancarias';--> statement-breakpoint
DROP TABLE `contas_bancarias`;--> statement-breakpoint
ALTER TABLE `__new_contas_bancarias` RENAME TO `contas_bancarias`;--> statement-breakpoint
CREATE TABLE `__new_contas_fixas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`categoria_id` integer,
	`valor` integer NOT NULL,
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
INSERT INTO `__new_contas_fixas`("id", "nome", "categoria_id", "valor", "dia_vencimento", "forma_pagamento", "conta_bancaria_id", "cartao_id", "recorrencia", "data_inicio", "data_fim", "membro_id", "ativo") SELECT "id", "nome", "categoria_id", CAST(ROUND("valor" * 100) AS INTEGER), "dia_vencimento", "forma_pagamento", "conta_bancaria_id", "cartao_id", "recorrencia", "data_inicio", "data_fim", "membro_id", "ativo" FROM `contas_fixas`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_contas_fixas', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_contas_fixas');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('contas_fixas', '__new_contas_fixas')) WHERE name = '__new_contas_fixas';--> statement-breakpoint
DROP TABLE `contas_fixas`;--> statement-breakpoint
ALTER TABLE `__new_contas_fixas` RENAME TO `contas_fixas`;--> statement-breakpoint
CREATE TABLE `__new_faturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cartao_id` integer NOT NULL,
	`mes_referencia` text NOT NULL,
	`data_fechamento` text NOT NULL,
	`data_vencimento` text NOT NULL,
	`status` text DEFAULT 'aberta',
	`conta_bancaria_id` integer,
	`valor_pago` integer,
	`data_pagamento` text
);
--> statement-breakpoint
INSERT INTO `__new_faturas`("id", "cartao_id", "mes_referencia", "data_fechamento", "data_vencimento", "status", "conta_bancaria_id", "valor_pago", "data_pagamento") SELECT "id", "cartao_id", "mes_referencia", "data_fechamento", "data_vencimento", "status", "conta_bancaria_id", CAST(ROUND("valor_pago" * 100) AS INTEGER), "data_pagamento" FROM `faturas`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_faturas', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_faturas');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('faturas', '__new_faturas')) WHERE name = '__new_faturas';--> statement-breakpoint
DROP TABLE `faturas`;--> statement-breakpoint
ALTER TABLE `__new_faturas` RENAME TO `faturas`;--> statement-breakpoint
CREATE TABLE `__new_gastos_rapidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`valor` integer NOT NULL,
	`categoria_id` integer,
	`descricao` text,
	`data` text NOT NULL,
	`forma_pagamento` text NOT NULL,
	`conta_bancaria_id` integer,
	`cartao_id` integer,
	`membro_id` integer,
	`valor_original` integer,
	`justificativa_alteracao` text
);
--> statement-breakpoint
INSERT INTO `__new_gastos_rapidos`("id", "valor", "categoria_id", "descricao", "data", "forma_pagamento", "conta_bancaria_id", "cartao_id", "membro_id", "valor_original", "justificativa_alteracao") SELECT "id", CAST(ROUND("valor" * 100) AS INTEGER), "categoria_id", "descricao", "data", "forma_pagamento", "conta_bancaria_id", "cartao_id", "membro_id", CAST(ROUND("valor_original" * 100) AS INTEGER), "justificativa_alteracao" FROM `gastos_rapidos`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_gastos_rapidos', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_gastos_rapidos');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('gastos_rapidos', '__new_gastos_rapidos')) WHERE name = '__new_gastos_rapidos';--> statement-breakpoint
DROP TABLE `gastos_rapidos`;--> statement-breakpoint
ALTER TABLE `__new_gastos_rapidos` RENAME TO `gastos_rapidos`;--> statement-breakpoint
CREATE TABLE `__new_metas_financeiras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`valor_meta` integer NOT NULL,
	`valor_atual` integer DEFAULT 0 NOT NULL,
	`data_meta` text,
	`categoria` text
);
--> statement-breakpoint
INSERT INTO `__new_metas_financeiras`("id", "nome", "valor_meta", "valor_atual", "data_meta", "categoria") SELECT "id", "nome", CAST(ROUND("valor_meta" * 100) AS INTEGER), CAST(ROUND("valor_atual" * 100) AS INTEGER), "data_meta", "categoria" FROM `metas_financeiras`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_metas_financeiras', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_metas_financeiras');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('metas_financeiras', '__new_metas_financeiras')) WHERE name = '__new_metas_financeiras';--> statement-breakpoint
DROP TABLE `metas_financeiras`;--> statement-breakpoint
ALTER TABLE `__new_metas_financeiras` RENAME TO `metas_financeiras`;--> statement-breakpoint
CREATE TABLE `__new_movimentacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conta_bancaria_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`valor` integer NOT NULL,
	`data` text NOT NULL,
	`descricao` text,
	`categoria_id` integer,
	`conta_destino_id` integer,
	`origem` text DEFAULT 'manual',
	`membro_id` integer,
	`reservar_proximo_mes` integer DEFAULT false,
	`recorrente` integer DEFAULT false,
	`recorrente_origem_id` integer
);
--> statement-breakpoint
INSERT INTO `__new_movimentacoes`("id", "conta_bancaria_id", "tipo", "valor", "data", "descricao", "categoria_id", "conta_destino_id", "origem", "membro_id", "reservar_proximo_mes", "recorrente", "recorrente_origem_id") SELECT "id", "conta_bancaria_id", "tipo", CAST(ROUND("valor" * 100) AS INTEGER), "data", "descricao", "categoria_id", "conta_destino_id", "origem", "membro_id", "reservar_proximo_mes", "recorrente", "recorrente_origem_id" FROM `movimentacoes`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_movimentacoes', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_movimentacoes');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('movimentacoes', '__new_movimentacoes')) WHERE name = '__new_movimentacoes';--> statement-breakpoint
DROP TABLE `movimentacoes`;--> statement-breakpoint
ALTER TABLE `__new_movimentacoes` RENAME TO `movimentacoes`;--> statement-breakpoint
CREATE TABLE `__new_movimentacoes_reserva` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`valor` integer NOT NULL,
	`data` text NOT NULL,
	`justificativa` text
);
--> statement-breakpoint
INSERT INTO `__new_movimentacoes_reserva`("id", "tipo", "valor", "data", "justificativa") SELECT "id", "tipo", CAST(ROUND("valor" * 100) AS INTEGER), "data", "justificativa" FROM `movimentacoes_reserva`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_movimentacoes_reserva', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_movimentacoes_reserva');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('movimentacoes_reserva', '__new_movimentacoes_reserva')) WHERE name = '__new_movimentacoes_reserva';--> statement-breakpoint
DROP TABLE `movimentacoes_reserva`;--> statement-breakpoint
ALTER TABLE `__new_movimentacoes_reserva` RENAME TO `movimentacoes_reserva`;--> statement-breakpoint
CREATE TABLE `__new_parcelas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`compra_parcelada_id` integer,
	`conta_fixa_id` integer,
	`numero` integer NOT NULL,
	`valor` integer NOT NULL,
	`mes_referencia` text NOT NULL,
	`fatura_id` integer,
	`status` text DEFAULT 'pendente',
	`data_pagamento` text,
	`valor_original` integer,
	`justificativa_alteracao` text
);
--> statement-breakpoint
INSERT INTO `__new_parcelas`("id", "compra_parcelada_id", "conta_fixa_id", "numero", "valor", "mes_referencia", "fatura_id", "status", "data_pagamento", "valor_original", "justificativa_alteracao") SELECT "id", "compra_parcelada_id", "conta_fixa_id", "numero", CAST(ROUND("valor" * 100) AS INTEGER), "mes_referencia", "fatura_id", "status", "data_pagamento", CAST(ROUND("valor_original" * 100) AS INTEGER), "justificativa_alteracao" FROM `parcelas`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_parcelas', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_parcelas');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('parcelas', '__new_parcelas')) WHERE name = '__new_parcelas';--> statement-breakpoint
DROP TABLE `parcelas`;--> statement-breakpoint
ALTER TABLE `__new_parcelas` RENAME TO `parcelas`;--> statement-breakpoint
CREATE TABLE `__new_reserva_emergencia` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`valor_meta` integer NOT NULL,
	`valor_atual` integer DEFAULT 0 NOT NULL,
	`meses_cobertura_desejados` integer
);
--> statement-breakpoint
INSERT INTO `__new_reserva_emergencia`("id", "valor_meta", "valor_atual", "meses_cobertura_desejados") SELECT "id", CAST(ROUND("valor_meta" * 100) AS INTEGER), CAST(ROUND("valor_atual" * 100) AS INTEGER), "meses_cobertura_desejados" FROM `reserva_emergencia`;--> statement-breakpoint
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_reserva_emergencia', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_reserva_emergencia');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = (SELECT MAX(seq) FROM sqlite_sequence WHERE name IN ('reserva_emergencia', '__new_reserva_emergencia')) WHERE name = '__new_reserva_emergencia';--> statement-breakpoint
DROP TABLE `reserva_emergencia`;--> statement-breakpoint
ALTER TABLE `__new_reserva_emergencia` RENAME TO `reserva_emergencia`;