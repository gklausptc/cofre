import type { PreferenciasRepository } from '@/domain/repositories/preferenciasRepository';
import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { preferencias } from '@/data/db/schema';
import type { Preferencias, PreferenciasAtualizaveis } from '@/domain/types/entities';

const PADRAO: Omit<Preferencias, 'id'> = {
  tema: 'sistema',
  bloqueioAtivo: false,
  biometriaAtiva: false,
  tutorialConcluido: false,
  ultimoBackupEm: null,
  taxaCdiAnual: null,
  taxaSelicAnual: null,
  taxasAtualizadasEm: null,
  configNotificacoes: null,
  adiamentosNotificacoes: null,
  permissaoNotificacoesPedida: false,
  divisaoSalario: null,
  salariosDivididos: null,
  insightsDispensados: null,
  alertasEnviados: null,
  nomesProprios: null,
};

export async function buscarPreferencias(): Promise<Preferencias> {
  const [existente] = await db.select().from(preferencias).where(eq(preferencias.id, 1));
  if (existente) return existente;
  const [criado] = await db.insert(preferencias).values({ id: 1, ...PADRAO }).returning();
  return criado;
}

export async function atualizarPreferencias(dados: PreferenciasAtualizaveis): Promise<Preferencias> {
  await buscarPreferencias(); // garante que a linha singleton existe antes de atualizar
  const [atualizado] = await db.update(preferencias).set(dados).where(eq(preferencias.id, 1)).returning();
  return atualizado;
}

export const preferenciasRepositorySqlite: PreferenciasRepository = {
  buscarPreferencias,
  atualizarPreferencias,
};
