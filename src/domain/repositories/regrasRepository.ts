import type { ContatoPix, NovoContatoPix, RegraCategorizacao } from '@/domain/types/entities';
import type { DadosRegraCategorizacao } from './importacoesRepository';

export type DadosContatoPix = Omit<NovoContatoPix, 'id'>;

/** Regras de categorização e contatos PIX que o app aprendeu nas importações. */
export interface RegrasRepository {
  listarRegras(): Promise<RegraCategorizacao[]>;
  criarRegra(dados: DadosRegraCategorizacao): Promise<RegraCategorizacao>;
  atualizarRegra(id: number, dados: Partial<DadosRegraCategorizacao>): Promise<void>;
  excluirRegra(id: number): Promise<void>;
  listarContatos(): Promise<ContatoPix[]>;
  /** Cria o contato ou, se o nome já existe, atualiza o que ele representa. */
  salvarContato(dados: DadosContatoPix): Promise<ContatoPix>;
  atualizarContato(id: number, dados: Partial<DadosContatoPix>): Promise<void>;
  excluirContato(id: number): Promise<void>;
}
