/**
 * Últimas taxas conhecidas quando esta versão foi feita (Banco Central, séries SGS 432 e
 * 4389). O app não tem internet: servem de sugestão na tela de taxas, e o usuário atualiza
 * quando o Copom mudar a Selic. Centésimos de % ao ano.
 */
export const TAXAS_DE_REFERENCIA = {
  selicAnual: 1375,
  cdiAnual: 1365,
  /** Data das taxas acima. */
  data: '2026-10-16',
  /** Próxima reunião do Copom depois dessa data (a Selic pode mudar no fim dela). */
  proximaReuniaoCopom: '2026-11-04',
} as const;
