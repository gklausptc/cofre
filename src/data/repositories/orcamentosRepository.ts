import type { DadosOrcamento, OrcamentosRepository } from '@/domain/repositories/orcamentosRepository';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { orcamentos } from '@/data/db/schema';
import { emTransacao } from '@/data/db/transacao';

export async function listarOrcamentos() {
  return db.select().from(orcamentos);
}

export async function definirOrcamento(dados: DadosOrcamento) {
  await emTransacao(async () => {
    await db
      .delete(orcamentos)
      .where(
        and(
          eq(orcamentos.categoriaId, dados.categoriaId),
          eq(orcamentos.mesInicio, dados.mesInicio),
          eq(orcamentos.apenasNoMes, dados.apenasNoMes ?? false)
        )
      );
    await db.insert(orcamentos).values(dados);
  });
}

export async function removerOrcamento(categoriaId: number, mes: string) {
  await emTransacao(async () => {
    // do mês em diante sai tudo; antes dele, o limite continua valendo só até o mês anterior
    await db.delete(orcamentos).where(and(eq(orcamentos.categoriaId, categoriaId), gte(orcamentos.mesInicio, mes)));
    await db.insert(orcamentos).values({ categoriaId, mesInicio: mes, limite: 0, apenasNoMes: false });
  });
}

export const orcamentosRepositorySqlite: OrcamentosRepository = {
  listarOrcamentos,
  definirOrcamento,
  removerOrcamento,
};
