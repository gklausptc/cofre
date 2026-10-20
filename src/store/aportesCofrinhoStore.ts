import { create } from 'zustand';
import { repositorios } from '@/domain/repositories';
import { notificarImediatamente } from '@/core/notifications/notificationService';
import type { AporteCofrinho } from '@/domain/types/entities';
import { hojeIso } from '@/core/utils/date';
import { cofrinhoAtingiuMeta } from '@/domain/usecases/calcularProgressoCofrinho';
import { marcoAtingido, textoDoMarco } from '@/domain/usecases/notificacoes/marcosDaMeta';
import { lerConfigNotificacoes } from '@/domain/usecases/notificacoes/configNotificacoes';

const repo = () => repositorios().aportesCofrinho;

type AportesCofrinhoState = {
  aportes: AporteCofrinho[];
  carregando: boolean;
  carregar: () => Promise<void>;
  criar: (cofrinhoId: number, valor: number) => Promise<void>;
};

export const useAportesCofrinhoStore = create<AportesCofrinhoState>((set, get) => ({
  aportes: [],
  carregando: false,

  carregar: async () => {
    set({ carregando: true });
    const aportes = await repo().listarAportes();
    set({ aportes, carregando: false });
  },

  criar: async (cofrinhoId, valor) => {
    const antes = get()
      .aportes.filter((a) => a.cofrinhoId === cofrinhoId)
      .reduce((soma, a) => soma + a.valor, 0);
    await repo().criarAporte(cofrinhoId, valor, hojeIso());
    await get().carregar();

    const cofrinho = await repositorios().cofrinhos.buscarCofrinho(cofrinhoId);
    if (!cofrinho) return;
    const doCofrinho = get().aportes.filter((a) => a.cofrinhoId === cofrinhoId);
    if (cofrinhoAtingiuMeta(cofrinho, doCofrinho)) {
      await repositorios().cofrinhos.marcarCofrinhoConcluido(cofrinhoId);
    }
    // aviso nos 25/50/75/100% da meta, se ligado em Configurações → Notificações
    const depois = doCofrinho.reduce((soma, a) => soma + a.valor, 0);
    const marco = marcoAtingido(antes, depois, cofrinho.valorMeta);
    const preferencias = await repositorios().preferencias.buscarPreferencias();
    if (marco !== null && lerConfigNotificacoes(preferencias.configNotificacoes).meta_cofrinho.ativo) {
      const { titulo, corpo } = textoDoMarco(marco, cofrinho.nome);
      await notificarImediatamente(titulo, corpo, `/cofrinho/${cofrinhoId}`);
    }
  },
}));
