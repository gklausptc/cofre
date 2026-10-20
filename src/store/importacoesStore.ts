import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import type { RegistroDeImportacao } from '@/domain/repositories/importacoesRepository';
import type { Importacao } from '@/domain/types/entities';

const repo = () => repositorios().importacoes;

type ImportacoesState = {
  importacoes: Importacao[];
  carregar: () => Promise<void>;
  /** Grava a importação e as linhas numa transação; devolve o id da importação. */
  importar: (registro: RegistroDeImportacao) => Promise<number>;
};

export const useImportacoesStore = create<ImportacoesState>((set, get) => ({
  importacoes: [],

  carregar: async () => {
    set({ importacoes: await repo().listarImportacoes() });
  },

  importar: async (registro) => {
    const id = await repo().registrarImportacao(registro);
    await get().carregar();
    return id;
  },
}));
