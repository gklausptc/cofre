-- O valor guardado na reserva passa a ser calculado pelo histórico (aportes − retiradas).
-- Antes de tirar a coluna, um lançamento de ajuste faz o histórico bater com o valor gravado,
-- para o saldo da reserva não mudar.
INSERT INTO `movimentacoes_reserva` (`tipo`, `valor`, `data`, `justificativa`)
SELECT CASE WHEN `diferenca` > 0 THEN 'aporte' ELSE 'retirada' END, ABS(`diferenca`), date('now', 'localtime'), 'Ajuste para manter o saldo da reserva (Cofre 2.0)'
FROM (
  SELECT r.`valor_atual` - COALESCE((SELECT SUM(CASE WHEN m.`tipo` = 'aporte' THEN m.`valor` ELSE -m.`valor` END) FROM `movimentacoes_reserva` m), 0) AS `diferenca`
  FROM `reserva_emergencia` r
  WHERE r.`id` = 1
)
WHERE `diferenca` <> 0;--> statement-breakpoint
ALTER TABLE `reserva_emergencia` DROP COLUMN `valor_atual`;
