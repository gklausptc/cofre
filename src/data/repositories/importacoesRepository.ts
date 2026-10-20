import type {
  EfeitosDaImportacao,
  ImportacoesRepository,
  RegistroDeImportacao,
} from '@/domain/repositories/importacoesRepository';
import type { DadosMovimentacao } from '@/domain/repositories/movimentacoesRepository';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/data/db/client';
import {
  comprasParceladas,
  contasFixas,
  faturas,
  gastosRapidos,
  importacoes,
  movimentacoes,
  parcelas,
  perguntasPendentes,
  regrasCategorizacao,
} from '@/data/db/schema';
import type { DadosDaPergunta } from '@/domain/types/perguntas';
import { emTransacao } from '@/data/db/transacao';
import { registrarPagamentoFatura } from './faturasRepository';
import { gravarPerguntasDaImportacao } from './perguntasRepository';

/** Linhas por INSERT (o SQLite limita os parâmetros por comando). */
const LOTE = 50;

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

    // a ocorrência de conta fixa pode ter sido paga (ou apagada) entre a prévia e o gravar: aí a
    // linha entra como saída comum, sem dar baixa de novo nem ficar ligada a algo que não existe
    const idsDeContaFixa = registro.pagamentosDeContaFixa.map((p) => p.parcelaId);
    const abertas = new Set(
      idsDeContaFixa.length === 0
        ? []
        : (await db.select().from(parcelas).where(inArray(parcelas.id, idsDeContaFixa)))
            .filter((p) => p.status !== 'paga')
            .map((p) => p.id)
    );
    const linhas = registro.movimentacoes.map((m) =>
      m.origem === 'conta_fixa' && m.parcelaId != null && !abertas.has(m.parcelaId)
        ? { ...m, origem: 'manual' as const, parcelaId: null, ...ligadas }
        : { ...m, ...ligadas }
    );
    // em lotes, para não passar do limite de parâmetros do SQLite num extrato grande
    for (let i = 0; i < linhas.length; i += LOTE) await db.insert(movimentacoes).values(linhas.slice(i, i + LOTE));
    const gastos = registro.gastos.map((g) => ({ ...g, ...ligadas }));
    for (let i = 0; i < gastos.length; i += LOTE) await db.insert(gastosRapidos).values(gastos.slice(i, i + LOTE));

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
      if (alteracao.linha && registro.importacao.contaBancariaId != null) {
        efeitos.linhasAbsorvidas = [
          ...(efeitos.linhasAbsorvidas ?? []),
          { contaBancariaId: registro.importacao.contaBancariaId, ...alteracao.linha },
        ];
      }
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

export async function desfazerImportacao(id: number): Promise<void> {
  await emTransacao(async () => {
    const [importacao] = await db.select().from(importacoes).where(eq(importacoes.id, id));
    if (!importacao) return;
    const efeitos: EfeitosDaImportacao = importacao.efeitos
      ? (JSON.parse(importacao.efeitos) as EfeitosDaImportacao)
      : { parcelas: [], faturas: [], movimentacoes: [], regrasCriadas: [] };

    // compras parceladas e contas fixas criadas pelas respostas
    const compras = efeitos.comprasCriadas ?? [];
    if (compras.length > 0) {
      await db.delete(parcelas).where(inArray(parcelas.compraParceladaId, compras));
      await db.delete(comprasParceladas).where(inArray(comprasParceladas.id, compras));
    }
    // regras de conta fixa criadas junto com essas contas não podem apontar para conta apagada
    if ((efeitos.contasFixasCriadas ?? []).length > 0) {
      await db.delete(regrasCategorizacao).where(inArray(regrasCategorizacao.contaFixaId, efeitos.contasFixasCriadas ?? []));
    }
    for (const contaFixaId of efeitos.contasFixasCriadas ?? []) {
      const ocorrencias = await db.select().from(parcelas).where(eq(parcelas.contaFixaId, contaFixaId));
      const pagas = ocorrencias.filter((p) => p.status === 'paga');
      await db.delete(parcelas).where(and(eq(parcelas.contaFixaId, contaFixaId), eq(parcelas.status, 'pendente')));
      // se você já pagou alguma ocorrência depois, a conta fica só desativada (o pagamento continua)
      if (pagas.length > 0) await db.update(contasFixas).set({ ativo: false }).where(eq(contasFixas.id, contaFixaId));
      else await db.delete(contasFixas).where(eq(contasFixas.id, contaFixaId));
    }

    await db.delete(movimentacoes).where(eq(movimentacoes.importacaoId, id));
    await db.delete(gastosRapidos).where(eq(gastosRapidos.importacaoId, id));
    // gastos de importações antigas que tinham virado parcelas voltam como eram (só os de
    // importações que ainda existem, para continuarem podendo ser desfeitos)
    const existentes = new Set((await db.select({ id: importacoes.id }).from(importacoes)).map((i) => i.id));
    const devolver = (efeitos.gastosApagados ?? []).filter(
      (g) => g.importacaoId !== id && (g.importacaoId === null || existentes.has(g.importacaoId))
    );
    for (let i = 0; i < devolver.length; i += LOTE) await db.insert(gastosRapidos).values(devolver.slice(i, i + LOTE));

    for (const antes of efeitos.parcelas) {
      const { id: parcelaId, ...campos } = antes;
      await db.update(parcelas).set(campos).where(eq(parcelas.id, parcelaId));
    }
    for (const fatura of efeitos.faturas) {
      if (fatura.antes === null) await db.delete(faturas).where(eq(faturas.id, fatura.id));
      else await db.update(faturas).set(fatura.antes).where(eq(faturas.id, fatura.id));
    }
    for (const alterada of efeitos.movimentacoes) {
      await db.update(movimentacoes).set(alterada.antes).where(eq(movimentacoes.id, alterada.id));
    }

    // perguntas: as desta importação saem; nas juntadas com outras, só as linhas dela
    const pendentes = await db.select().from(perguntasPendentes).where(eq(perguntasPendentes.status, 'pendente'));
    for (const pergunta of pendentes) {
      const dados = JSON.parse(pergunta.dados) as DadosDaPergunta;
      const restantes = dados.linhas.filter((l) => l.importacaoId !== id);
      const soDesta = pergunta.importacaoId === id && (dados.tipo === 'duplicidade' || restantes.length === 0);
      if (soDesta || (dados.linhas.length > 0 && restantes.length === 0)) {
        await db.delete(perguntasPendentes).where(eq(perguntasPendentes.id, pergunta.id));
      } else if (restantes.length !== dados.linhas.length) {
        await db
          .update(perguntasPendentes)
          .set({ quantidade: restantes.length, dados: JSON.stringify({ ...dados, linhas: restantes }) })
          .where(eq(perguntasPendentes.id, pergunta.id));
      }
    }

    await db.delete(importacoes).where(eq(importacoes.id, id));
  });
}

export const importacoesRepositorySqlite: ImportacoesRepository = {
  listarImportacoes,
  registrarImportacao,
  desfazerImportacao,
};
