export interface ManutencaoRepository {
  /**
   * Apaga todos os dados do usuário e recria o essencial (categorias padrão).
   * Usado pela ação "Limpar todos os dados" em Configurações.
   */
  limparTodosOsDados(): Promise<void>;
  /**
   * Executa a tarefa numa transação: ou tudo é gravado, ou nada. Não aninhar
   * (uma transação dentro de outra falha).
   */
  emTransacao<T>(tarefa: () => Promise<T>): Promise<T>;
}
