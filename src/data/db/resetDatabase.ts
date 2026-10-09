import { db } from './client';
import * as schema from './schema';
import { seedCategoriasPadrao } from './seed';

/**
 * Apaga todos os dados do usuário (contas, movimentações, cartões, cofrinhos,
 * etc.) e recria o essencial (categorias padrão, preferências). Usado pela ação
 * "Limpar todos os dados" em Configurações — também serve pra corrigir qualquer
 * dado órfão que tenha ficado de versões anteriores do app.
 */
export async function limparTodosOsDados() {
  const tabelas = [
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
    schema.categorias,
    schema.preferencias,
  ];

  for (const tabela of tabelas) {
    await db.delete(tabela);
  }

  await seedCategoriasPadrao(db);
}
