import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { DadosRegraCategorizacao } from '@/domain/repositories/importacoesRepository';
import type { DadosContatoPix } from '@/domain/repositories/regrasRepository';
import type { ContatoPix, RegraCategorizacao } from '@/domain/types/entities';

const repo = () => repositorios().regras;

type RegrasState = {
  regras: RegraCategorizacao[];
  contatos: ContatoPix[];
  carregar: () => Promise<void>;
  criarRegra: (dados: DadosRegraCategorizacao) => Promise<void>;
  atualizarRegra: (id: number, dados: Partial<DadosRegraCategorizacao>) => Promise<void>;
  excluirRegra: (id: number) => Promise<void>;
  salvarContato: (dados: DadosContatoPix) => Promise<void>;
  atualizarContato: (id: number, dados: Partial<DadosContatoPix>) => Promise<void>;
  excluirContato: (id: number) => Promise<void>;
};

/** Regras de categorização e contatos PIX aprendidos nas importações. */
export const useRegrasStore = create<RegrasState>((set, get) => ({
  regras: [],
  contatos: [],

  carregar: async () => {
    const [regras, contatos] = await Promise.all([repo().listarRegras(), repo().listarContatos()]);
    set({ regras, contatos });
  },

  criarRegra: async (dados) => {
    await repo().criarRegra(dados);
    await get().carregar();
  },

  atualizarRegra: async (id, dados) => {
    await repo().atualizarRegra(id, dados);
    await get().carregar();
  },

  excluirRegra: async (id) => {
    await repo().excluirRegra(id);
    await get().carregar();
  },

  salvarContato: async (dados) => {
    await repo().salvarContato(dados);
    await get().carregar();
  },

  atualizarContato: async (id, dados) => {
    await repo().atualizarContato(id, dados);
    await get().carregar();
  },

  excluirContato: async (id) => {
    await repo().excluirContato(id);
    await get().carregar();
  },
}));
