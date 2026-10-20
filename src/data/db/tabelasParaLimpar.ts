import * as schema from './schema';

/**
 * Todas as tabelas do usuário, na ordem de apagar (quem aponta para outra vem antes). O teste
 * `tabelasParaLimpar.test.ts` falha se uma tabela nova do schema ficar de fora — foi assim que as
 * perguntas da Revisão, as regras, os contatos PIX e os orçamentos sobreviveram ao "Limpar".
 */
export const TABELAS_PARA_LIMPAR = [
  schema.perguntasPendentes,
  schema.regrasCategorizacao,
  schema.contatosPix,
  schema.orcamentos,
  schema.aportesCofrinho,
  schema.movimentacoesReserva,
  schema.movimentacoes,
  schema.gastosRapidos,
  schema.parcelas,
  schema.comprasParceladas,
  schema.faturas,
  schema.contasFixas,
  schema.cartoes,
  schema.contasBancarias,
  schema.cofrinhos,
  schema.reservaEmergencia,
  schema.metasFinanceiras,
  schema.membrosFamilia,
  schema.importacoes,
  schema.categorias,
  schema.preferencias,
];
