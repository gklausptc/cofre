import type {
  EfeitosDaImportacao,
  ImportacoesRepository,
  RegistroDeImportacao,
} from '@/domain/repositories/importacoesRepository';
import type { DadosMovimentacao } from '@/domain/repositories/movimentacoesRepository';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { faturas, gastosRapidos, importacoes, movimentacoes, parcelas, regrasCategorizacao } from '@/data/db/schema';
import { emTransacao } from '@/data/db/transacao';
import { registrarPagamentoFatura } from './faturasRepository';
import { gravarPerguntasDaImportacao } from './perguntasRepository';

export async function listarImportacoes() {
  return db.select().from(importacoes).orderBy(desc(importacoes.criadaEm));
}

/** Os campos de `mudancas` como estão hoje na movimentação (para desfazer). */
function camposAntes(atual: Record<string, unknown>, mudancas: Partial<DadosMovimentacao>): Partial<DadosMovimentacao> {
  const antes: Record<string, unknown> = {};
  for (const campo of Object.keys(mudancas)) antes[campo] = atual[campo] ?? null;
  return antes as Partial<DadosMovimentacao>;
}

export async function registrarImportacao(registro: RegistroDeImportacao): Promise<number> {
  return emTransacao(async () => {
    const [importacao] = await db.insert(importacoes).values(registro.importacao).returning();
    const ligadas = { importacaoId: importacao.id };
    const efeitos: EfeitosDaImportacao = { parcelas: [], faturas: [], movimentacoes: [], regrasCriadas: [] };
    const guardarParcelas = async (ids: number[]) => {
      const novas = ids.filter((id) => !efeitos.parcelas.some((p) => p.id === id));
      if (novas.length === 0) return;
      const atuais = await db.select().from(parcelas).where(inArray(parcelas.id, novas));
      for (const p of atuais) {
        efeitos.parcelas.push({
          id: p.id,
          status: p.status,
          dataPagamento: p.dataPagamento,
          valor: p.valor,
          valorOriginal: p.valorOriginal,
          justificativaAlteracao: p.justificativaAlteracao,
        });
      }
    };

    if (registro.movimentacoes.length > 0) {
      await db.insert(movimentacoes).values(registro.movimentacoes.map((m) => ({ ...m, ...ligadas })));
    }
    if (registro.gastos.length > 0) {
      await db.insert(gastosRapidos).values(registro.gastos.map((g) => ({ ...g, ...ligadas })));
    }

    // contas fixas pagas pelo extrato: o valor passa a ser o do banco (guardando o de antes)
    await guardarParcelas(registro.pagamentosDeContaFixa.map((p) => p.parcelaId));
    for (const pagamento of registro.pagamentosDeContaFixa) {
      const antes = efeitos.parcelas.find((p) => p.id === pagamento.parcelaId);
      if (!antes || antes.status === 'paga') continue;
      const mudouValor = antes.valor !== pagamento.valor;
      await db
        .update(parcelas)
        .set({
          status: 'paga',
          dataPagamento: pagamento.dataPagamento,
          ...(mudouValor
            ? {
                valor: pagamento.valor,
                valorOriginal: antes.valorOriginal ?? antes.valor,
                justificativaAlteracao: 'Valor do extrato importado',
              }
            : {}),
        })
        .where(eq(parcelas.id, pagamento.parcelaId));
    }

    // faturas pagas pelo extrato
    for (const { pagamento, parcelaIds, saida } of registro.pagamentosDeFatura) {
      const [existente] = await db
        .select()
        .from(faturas)
        .where(and(eq(faturas.cartaoId, pagamento.cartaoId), eq(faturas.mesReferencia, pagamento.mesReferencia)));
      await guardarParcelas(parcelaIds);
      if (parcelaIds.length > 0) {
        await db
          .update(parcelas)
          .set({ status: 'paga', dataPagamento: pagamento.dataPagamento })
          .where(and(inArray(parcelas.id, parcelaIds), eq(parcelas.status, 'pendente')));
      }
      const faturaId = await registrarPagamentoFatura(pagamento);
      if (!efeitos.faturas.some((f) => f.id === faturaId)) {
        efeitos.faturas.push({
          id: faturaId,
          antes: existente
            ? {
                status: existente.status,
                contaBancariaId: existente.contaBancariaId,
                valorPago: existente.valorPago,
                dataPagamento: existente.dataPagamento,
              }
            : null,
        });
      }
      await db.insert(movimentacoes).values({ ...saida, faturaId, parcelaId: null, ...ligadas });
    }

    // lançamentos que já estavam no app e mudam
    for (const alteracao of registro.alteracoes) {
      const [atual] = await db.select().from(movimentacoes).where(eq(movimentacoes.id, alteracao.movimentacaoId));
      if (!atual) continue;
      efeitos.movimentacoes.push({ id: atual.id, antes: camposAntes(atual, alteracao.mudancas) });
      await db.update(movimentacoes).set(alteracao.mudancas).where(eq(movimentacoes.id, atual.id));
    }

    for (const regra of registro.regrasNovas) {
      const [criada] = await db.insert(regrasCategorizacao).values(regra).returning();
      efeitos.regrasCriadas.push(criada.id);
    }
    if (registro.regrasUsadas.length > 0) {
      await db
        .update(regrasCategorizacao)
        .set({ vezesUsada: sql`${regrasCategorizacao.vezesUsada} + 1` })
        .where(inArray(regrasCategorizacao.id, registro.regrasUsadas));
    }

    await gravarPerguntasDaImportacao(importacao.id, registro.perguntas, registro.importacao.criadaEm);

    await db
      .update(importacoes)
      .set({ efeitos: JSON.stringify(efeitos), pendentes: registro.perguntas.length })
      .where(eq(importacoes.id, importacao.id));
    return importacao.id;
  });
}

export const importacoesRepositorySqlite: ImportacoesRepository = {
  listarImportacoes,
  registrarImportacao,
};
