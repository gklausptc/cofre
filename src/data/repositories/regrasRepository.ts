import type { DadosContatoPix, RegrasRepository } from '@/domain/repositories/regrasRepository';
import type { DadosRegraCategorizacao } from '@/domain/repositories/importacoesRepository';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { contatosPix, regrasCategorizacao } from '@/data/db/schema';

export async function listarRegras() {
  return db.select().from(regrasCategorizacao).orderBy(desc(regrasCategorizacao.vezesUsada));
}

export async function criarRegra(dados: DadosRegraCategorizacao) {
  const [criada] = await db.insert(regrasCategorizacao).values(dados).returning();
  return criada;
}

export async function atualizarRegra(id: number, dados: Partial<DadosRegraCategorizacao>) {
  await db.update(regrasCategorizacao).set(dados).where(eq(regrasCategorizacao.id, id));
}

export async function excluirRegra(id: number) {
  await db.delete(regrasCategorizacao).where(eq(regrasCategorizacao.id, id));
}

export async function listarContatos() {
  return db.select().from(contatosPix).orderBy(contatosPix.apelido);
}

export async function salvarContato(dados: DadosContatoPix) {
  const [existente] = await db.select().from(contatosPix).where(eq(contatosPix.nomeNormalizado, dados.nomeNormalizado));
  if (existente) {
    const [atualizado] = await db.update(contatosPix).set(dados).where(eq(contatosPix.id, existente.id)).returning();
    return atualizado;
  }
  const [criado] = await db.insert(contatosPix).values(dados).returning();
  return criado;
}

export async function atualizarContato(id: number, dados: Partial<DadosContatoPix>) {
  await db.update(contatosPix).set(dados).where(eq(contatosPix.id, id));
}

export async function excluirContato(id: number) {
  await db.delete(contatosPix).where(eq(contatosPix.id, id));
}

export const regrasRepositorySqlite: RegrasRepository = {
  listarRegras,
  criarRegra,
  atualizarRegra,
  excluirRegra,
  listarContatos,
  salvarContato,
  atualizarContato,
  excluirContato,
};
