import type { FaturasRepository, PagamentoFatura } from '@/domain/repositories/faturasRepository';
import type { EfeitosDaImportacao } from '@/domain/repositories/importacoesRepository';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { faturas, importacoes, movimentacoes, parcelas } from '@/data/db/schema';
import { emTransacao } from '@/data/db/transacao';

export async function listarFaturas() {
  return db.select().from(faturas);
}

/** Registra (ou atualiza) a fatura do cartão/mês como paga e devolve o id dela. */
export async function registrarPagamentoFatura(dados: PagamentoFatura): Promise<number> {
  const [existente] = await db
    .select()
    .from(faturas)
    .where(and(eq(faturas.cartaoId, dados.cartaoId), eq(faturas.mesReferencia, dados.mesReferencia)));

  const campos = {
    status: 'paga' as const,
    contaBancariaId: dados.contaBancariaId,
    valorPago: dados.valorPago,
    dataPagamento: dados.dataPagamento,
  };

  if (existente) {
    await db.update(faturas).set(campos).where(eq(faturas.id, existente.id));
    return existente.id;
  }
  const [criada] = await db
    .insert(faturas)
    .values({
      cartaoId: dados.cartaoId,
      mesReferencia: dados.mesReferencia,
      dataFechamento: dados.dataFechamento,
      dataVencimento: dados.dataVencimento,
      ...campos,
    })
    .returning();
  return criada.id;
}

export async function ligarPagamento(dados: { pagamento: PagamentoFatura; parcelaIds: number[]; movimentacaoId: number | null }) {
  await emTransacao(async () => {
    const { pagamento, parcelaIds, movimentacaoId } = dados;
    const [faturaAntes] = await db
      .select()
      .from(faturas)
      .where(and(eq(faturas.cartaoId, pagamento.cartaoId), eq(faturas.mesReferencia, pagamento.mesReferencia)));
    const parcelasAntes = parcelaIds.length > 0 ? await db.select().from(parcelas).where(inArray(parcelas.id, parcelaIds)) : [];
    const [mov] = movimentacaoId !== null ? await db.select().from(movimentacoes).where(eq(movimentacoes.id, movimentacaoId)) : [];

    if (parcelaIds.length > 0) {
      await db
        .update(parcelas)
        .set({ status: 'paga', dataPagamento: pagamento.dataPagamento })
        .where(and(inArray(parcelas.id, parcelaIds), eq(parcelas.status, 'pendente')));
    }
    const faturaId = await registrarPagamentoFatura(pagamento);
    if (mov) {
      await db.update(movimentacoes).set({ origem: 'fatura', faturaId, categoriaId: null }).where(eq(movimentacoes.id, mov.id));
    }

    // a saída veio de um extrato importado: desfazer aquela importação volta tudo isto também
    if (mov?.importacaoId != null) {
      const [importacao] = await db.select().from(importacoes).where(eq(importacoes.id, mov.importacaoId));
      if (importacao) {
        const efeitos: EfeitosDaImportacao = importacao.efeitos
          ? (JSON.parse(importacao.efeitos) as EfeitosDaImportacao)
          : { parcelas: [], faturas: [], movimentacoes: [], regrasCriadas: [] };
        for (const p of parcelasAntes) {
          if (efeitos.parcelas.some((x) => x.id === p.id)) continue;
          efeitos.parcelas.push({ id: p.id, status: p.status, dataPagamento: p.dataPagamento, valor: p.valor, valorOriginal: p.valorOriginal, justificativaAlteracao: p.justificativaAlteracao });
        }
        if (!efeitos.faturas.some((f) => f.id === faturaId)) {
          efeitos.faturas.push({
            id: faturaId,
            antes: faturaAntes
              ? { status: faturaAntes.status, contaBancariaId: faturaAntes.contaBancariaId, valorPago: faturaAntes.valorPago, dataPagamento: faturaAntes.dataPagamento }
              : null,
          });
        }
        efeitos.movimentacoes.push({ id: mov.id, antes: { origem: mov.origem, faturaId: mov.faturaId, categoriaId: mov.categoriaId } });
        await db.update(importacoes).set({ efeitos: JSON.stringify(efeitos) }).where(eq(importacoes.id, importacao.id));
      }
    }
  });
}

export const faturasRepositorySqlite: FaturasRepository = {
  listarFaturas,
  registrarPagamentoFatura,
  ligarPagamento,
};
