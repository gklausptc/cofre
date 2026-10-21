import type { Cartao, NovoCartao } from '@/domain/types/entities';

export type DadosCartao = Omit<NovoCartao, 'id' | 'ativo'>;

export interface CartoesRepository {
  /** Só os ativos. */
  listarCartoes(): Promise<Cartao[]>;
  /** Também os desativados (exportar tudo). */
  listarTodosCartoes(): Promise<Cartao[]>;
  buscarCartao(id: number): Promise<Cartao | null>;
  criarCartao(dados: DadosCartao): Promise<Cartao>;
  atualizarCartao(id: number, dados: Partial<DadosCartao>): Promise<Cartao>;
  /** "Remover" um cartão o desativa: o histórico continua existindo. */
  desativarCartao(id: number): Promise<void>;
}
