import { repositorios } from '@/domain/repositories';
import { gerarRecorrencia } from '@/domain/usecases/gerarRecorrencia';
import { gerarReceitasRecorrentes } from '@/domain/usecases/gerarReceitasRecorrentes';
import { calcularNotificacoesVencimento } from '@/domain/usecases/calcularNotificacoesVencimento';
import { agendarNotificacoesVencimento, configurarNotificacoes } from '@/core/notifications/notificationService';

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

/** Reagenda os lembretes de vencimento a partir dos dados atuais. */
export async function agendarLembretesDoDia(): Promise<void> {
  const repos = repositorios();
  const [contasFixas, cartoes, comprasParceladas, parcelas] = await Promise.all([
    repos.contasFixas.listarContasFixas(),
    repos.cartoes.listarCartoes(),
    repos.comprasParceladas.listarComprasParceladas(),
    repos.parcelas.listarParcelas(),
  ]);
  const pendentes = parcelas.filter((p) => p.status === 'pendente');
  const itens = calcularNotificacoesVencimento(contasFixas, cartoes, comprasParceladas, pendentes);
  await configurarNotificacoes();
  await agendarNotificacoesVencimento(itens);
}
