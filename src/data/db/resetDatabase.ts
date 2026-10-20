import { db } from './client';
import { TABELAS_PARA_LIMPAR } from './tabelasParaLimpar';
import { seedCategoriasPadrao } from './seed';

/**
 * Apaga todos os dados do usuário (contas, lançamentos, cartões, cofrinhos, importações, perguntas
 * da Revisão, regras aprendidas, contatos PIX, orçamentos...) e recria o essencial (categorias
 * padrão; as preferências voltam ao padrão na próxima leitura). Usado pela ação "Limpar todos os
 * dados" em Configurações. Os backups automáticos (documentDirectory/backups) ficam.
 */
export async function limparTodosOsDados() {
  for (const tabela of TABELAS_PARA_LIMPAR) {
    await db.delete(tabela);
  }
  await seedCategoriasPadrao(db);
}
