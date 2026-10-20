ALTER TABLE `movimentacoes` ADD `fatura_id` integer;--> statement-breakpoint
ALTER TABLE `movimentacoes` ADD `parcela_id` integer;--> statement-breakpoint
-- Pagamentos que antes só mudavam o status passam a ser saídas reais na conta (opção B do
-- Cofre 2.0). 1) Conta fixa paga fora do cartão, com conta bancária: uma saída por ocorrência.
INSERT INTO `movimentacoes` (`conta_bancaria_id`, `tipo`, `valor`, `data`, `descricao`, `categoria_id`, `conta_destino_id`, `origem`, `membro_id`, `reservar_proximo_mes`, `recorrente`, `recorrente_origem_id`, `fatura_id`, `parcela_id`)
SELECT cf.`conta_bancaria_id`, 'saida', p.`valor`, COALESCE(p.`data_pagamento`, p.`mes_referencia` || '-01'), cf.`nome`, cf.`categoria_id`, NULL, 'conta_fixa', cf.`membro_id`, 0, 0, NULL, NULL, p.`id`
FROM `parcelas` p
JOIN `contas_fixas` cf ON cf.`id` = p.`conta_fixa_id`
WHERE p.`status` = 'paga'
  AND cf.`forma_pagamento` <> 'cartao'
  AND cf.`conta_bancaria_id` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `movimentacoes` m WHERE m.`parcela_id` = p.`id`);--> statement-breakpoint
-- 2) Fatura paga com conta bancária: uma saída com o valor pago.
INSERT INTO `movimentacoes` (`conta_bancaria_id`, `tipo`, `valor`, `data`, `descricao`, `categoria_id`, `conta_destino_id`, `origem`, `membro_id`, `reservar_proximo_mes`, `recorrente`, `recorrente_origem_id`, `fatura_id`, `parcela_id`)
SELECT f.`conta_bancaria_id`, 'saida', f.`valor_pago`, COALESCE(f.`data_pagamento`, f.`data_vencimento`), 'Fatura ' || COALESCE(c.`nome`, 'do cartão'), NULL, NULL, 'fatura', NULL, 0, 0, NULL, f.`id`, NULL
FROM `faturas` f
LEFT JOIN `cartoes` c ON c.`id` = f.`cartao_id`
WHERE f.`status` = 'paga'
  AND f.`conta_bancaria_id` IS NOT NULL
  AND COALESCE(f.`valor_pago`, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM `movimentacoes` m WHERE m.`fatura_id` = f.`id`);
