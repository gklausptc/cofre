import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { ContaFixa, NovaContaFixa } from '@/domain/types/entities';
import { gerarRecorrencia } from '@/domain/usecases/gerarRecorrencia';
import { pedirReagendamento } from '@/core/notifications/agendador';

const repo = () => repositorios().contasFixas;

type ContasFixasState = {
  contas: ContaFixa[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (dados: Omit<NovaContaFixa, 'id' | 'ativo'>) => Promise<void>;
  atualizar: (id: number, dados: Partial<NovaContaFixa>) => Promise<void>;
  remover: (id: number) => Promise<void>;
};

export const useContasFixasStore = create<ContasFixasState>((set, get) => ({
  contas: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const contas = await repo().listarContasFixas();
    set({ contas, carregando: false });
  },

  criar: async (dados) => {
    const conta = await repo().criarContaFixa(dados);
    // as próximas ocorrências já entram agora (antes só na próxima abertura do app)
    const repos = repositorios();
    const existentes = await repos.parcelas.listarParcelasPorContaFixa(conta.id);
    await repos.parcelas.inserirParcelas(gerarRecorrencia([conta], existentes));
    await get().carregar();
    pedirReagendamento();
  },

  atualizar: async (id, dados) => {
    await repo().atualizarContaFixa(id, dados);
    await get().carregar();
    pedirReagendamento();
  },

  remover: async (id) => {
    await repo().desativarContaFixa(id);
    await get().carregar();
    pedirReagendamento();
  },
}));
