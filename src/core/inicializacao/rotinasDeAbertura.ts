import { repositorios } from '@/domain/repositories';
import { gerarRecorrencia } from '@/domain/usecases/gerarRecorrencia';
import { gerarReceitasRecorrentes } from '@/domain/usecases/gerarReceitasRecorrentes';
import { reagendarTodas } from '@/core/notifications/agendador';

/**
 * O que precisa estar pronto antes da primeira tela: categorias padrão, as próximas
 * ocorrências das contas fixas e a cópia do mês das receitas recorrentes (salário).
 */
export async function prepararDadosDoDia(): Promise<void> {
  const repos = repositorios();
  await repos.categorias.garantirCategoriasPadrao();

  const [contasFixas, parcelasExistentes] = await Promise.all([
    repos.contasFixas.listarContasFixas(),
    repos.parcelas.listarParcelas(),
  ]);
  await repos.parcelas.inserirParcelas(gerarRecorrencia(contasFixas, parcelasExistentes));

  const movimentacoes = await repos.movimentacoes.listarMovimentacoes();
  await repos.movimentacoes.inserirMovimentacoes(gerarReceitasRecorrentes(movimentacoes));
}

/** Reagenda todas as notificações locais a partir dos dados atuais (ver `reagendarTodas`). */
export async function agendarLembretesDoDia(): Promise<void> {
  await reagendarTodas();
}
