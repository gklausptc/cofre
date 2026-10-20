import type { PerguntasRepository } from '@/domain/repositories/perguntasRepository';
import type { EfeitosDaImportacao } from '@/domain/repositories/importacoesRepository';
import type { PlanoDeResposta } from '@/domain/usecases/importacao/responderPergunta';
import type { LinhaDaPergunta, PerguntaNova } from '@/domain/types/perguntas';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/data/db/client';
import {
  cartoes,
  comprasParceladas,
  contasFixas,
  gastosRapidos,
  importacoes,
  movimentacoes,
  parcelas,
  perguntasPendentes,
  regrasCategorizacao,
} from '@/data/db/schema';
import { emTransacao } from '@/data/db/transacao';
import { gerarParcelas } from '@/domain/usecases/gerarParcelas';
import { gerarRecorrencia } from '@/domain/usecases/gerarRecorrencia';
import { salvarContato } from './regrasRepository';

export async function listarPendentes() {
  return db
    .select()
    .from(perguntasPendentes)
    .where(eq(perguntasPendentes.status, 'pendente'))
    .orderBy(desc(perguntasPendentes.valor), perguntasPendentes.id);
}

/** Tipos em que perguntas de importações diferentes se juntam (mesma pessoa, mesmo texto). */
const JUNTAM: PerguntaNova['tipo'][] = ['categoria', 'pix_pessoa', 'recorrencia'];

/** Grava as perguntas de uma importação, juntando com as pendentes de mesma chave. Use dentro de uma transação. */
export async function gravarPerguntasDaImportacao(importacaoId: number, perguntas: PerguntaNova[], criadaEm: string) {
  for (const pergunta of perguntas) {
    const linhas = pergunta.dados.linhas.map((l) => ({ ...l, importacaoId: l.importacaoId ?? importacaoId }));
    const dados = { ...pergunta.dados, linhas };
    const [existente] = await db
      .select()
      .from(perguntasPendentes)
      .where(and(eq(perguntasPendentes.chave, pergunta.chave), eq(perguntasPendentes.status, 'pendente')));
    if (existente && JUNTAM.includes(pergunta.tipo)) {
      const anterior = JSON.parse(existente.dados) as PerguntaNova['dados'];
      const juntas = [...anterior.linhas, ...linhas.filter((l) => !anterior.linhas.some((a) => a.idExterno === l.idExterno))];
      await db
        .update(perguntasPendentes)
        .set({
          pista: pergunta.pista,
          valor: existente.valor + pergunta.valor,
          quantidade: juntas.length,
          dados: JSON.stringify({ ...dados, linhas: juntas }),
        })
        .where(eq(perguntasPendentes.id, existente.id));
      continue;
    }
    if (existente) continue;
    await db.insert(perguntasPendentes).values({
      importacaoId,
      tipo: pergunta.tipo,
      chave: pergunta.chave,
      titulo: pergunta.titulo,
      pista: pergunta.pista,
      valor: pergunta.valor,
      quantidade: pergunta.quantidade,
      dados: JSON.stringify(dados),
      status: 'pendente',
      criadaEm,
    });
  }
}

/** Condição SQL das linhas (por importação + id externo) numa tabela. */
function condicaoDasLinhas(
  linhas: LinhaDaPergunta[],
  onde: LinhaDaPergunta['onde'],
  colunas: { importacaoId: typeof movimentacoes.importacaoId | typeof gastosRapidos.importacaoId; idExterno: typeof movimentacoes.idExterno | typeof gastosRapidos.idExterno }
): SQL | undefined {
  const porImportacao = new Map<number, string[]>();
  for (const l of linhas) {
    if (l.onde !== onde || l.importacaoId === null) continue;
    porImportacao.set(l.importacaoId, [...(porImportacao.get(l.importacaoId) ?? []), l.idExterno]);
  }
  const partes = [...porImportacao].map(([id, ids]) => and(eq(colunas.importacaoId, id), inArray(colunas.idExterno, ids)));
  return partes.length === 0 ? undefined : or(...partes);
}

async function anotarNaImportacao(importacaoId: number | null, mudar: (efeitos: EfeitosDaImportacao) => void) {
  if (importacaoId === null) return;
  const [importacao] = await db.select().from(importacoes).where(eq(importacoes.id, importacaoId));
  if (!importacao) return;
  const efeitos: EfeitosDaImportacao = importacao.efeitos
    ? (JSON.parse(importacao.efeitos) as EfeitosDaImportacao)
    : { parcelas: [], faturas: [], movimentacoes: [], regrasCriadas: [] };
  mudar(efeitos);
  await db.update(importacoes).set({ efeitos: JSON.stringify(efeitos) }).where(eq(importacoes.id, importacaoId));
}

export async function responder(perguntaId: number, plano: PlanoDeResposta) {
  await emTransacao(async () => {
    const [pergunta] = await db.select().from(perguntasPendentes).where(eq(perguntasPendentes.id, perguntaId));
    if (!pergunta || pergunta.status !== 'pendente') return;
    const importacaoId = plano.linhas.find((l) => l.importacaoId !== null)?.importacaoId ?? pergunta.importacaoId;

    const nasMovimentacoes = condicaoDasLinhas(plano.linhas, 'movimentacao', movimentacoes);
    const nosGastos = condicaoDasLinhas(plano.linhas, 'gasto', gastosRapidos);

    if (plano.atualizarLinhas) {
      if (nasMovimentacoes) await db.update(movimentacoes).set(plano.atualizarLinhas).where(nasMovimentacoes);
      if (nosGastos) await db.update(gastosRapidos).set(plano.atualizarLinhas).where(nosGastos);
    }

    if (plano.transferencia && nasMovimentacoes) {
      await db
        .update(movimentacoes)
        .set({ tipo: 'transferencia', contaDestinoId: plano.transferencia.contaDestinoId, categoriaId: null })
        .where(and(nasMovimentacoes, eq(movimentacoes.tipo, 'saida')));
      const origem = plano.transferencia.origemDasEntradas;
      if (origem !== null) {
        // a entrada vira transferência da outra conta para esta (o SET usa os valores de antes)
        await db
          .update(movimentacoes)
          .set({
            tipo: 'transferencia',
            contaDestinoId: sql`${movimentacoes.contaBancariaId}`,
            contaBancariaId: origem,
            categoriaId: null,
          })
          .where(and(nasMovimentacoes, eq(movimentacoes.tipo, 'entrada')));
      }
    }

    if (plano.apagarLinhas) {
      if (nasMovimentacoes) await db.delete(movimentacoes).where(nasMovimentacoes);
      if (nosGastos) await db.delete(gastosRapidos).where(nosGastos);
    }
    if (plano.apagarGastos.length > 0) {
      await db.delete(gastosRapidos).where(inArray(gastosRapidos.id, plano.apagarGastos));
    }

    if (plano.regra) {
      const [criada] = await db.insert(regrasCategorizacao).values(plano.regra).returning();
      await anotarNaImportacao(importacaoId, (e) => e.regrasCriadas.push(criada.id));
    }
    if (plano.contato) await salvarContato(plano.contato);

    if (plano.compraParcelada) {
      const { dados, mesPrimeiraParcela, pagas } = plano.compraParcelada;
      const [cartao] = await db.select().from(cartoes).where(eq(cartoes.id, dados.cartaoId));
      if (cartao) {
        const [compra] = await db.insert(comprasParceladas).values(dados).returning();
        const novas = gerarParcelas(compra, cartao, mesPrimeiraParcela).map((p) => {
          const paga = pagas.find((x) => x.numero === p.numero);
          return paga ? { ...p, status: 'paga' as const, dataPagamento: paga.dataPagamento } : p;
        });
        if (novas.length > 0) await db.insert(parcelas).values(novas);
        await anotarNaImportacao(importacaoId, (e) => {
          e.comprasCriadas = [...(e.comprasCriadas ?? []), compra.id];
        });
      }
    }

    if (plano.contaFixa) {
      const [conta] = await db.insert(contasFixas).values(plano.contaFixa.dados).returning();
      if (plano.contaFixa.regra) {
        await db.insert(regrasCategorizacao).values({ ...plano.contaFixa.regra, contaFixaId: conta.id });
      }
      const ocorrencias = gerarRecorrencia([conta], []);
      if (ocorrencias.length > 0) await db.insert(parcelas).values(ocorrencias);
      await anotarNaImportacao(importacaoId, (e) => {
        e.contasFixasCriadas = [...(e.contasFixasCriadas ?? []), conta.id];
      });
    }

    if (plano.inserir) {
      const ligada = { importacaoId: pergunta.importacaoId };
      if (plano.inserir.movimentacao) await db.insert(movimentacoes).values({ ...plano.inserir.movimentacao, ...ligada });
      if (plano.inserir.gasto) await db.insert(gastosRapidos).values({ ...plano.inserir.gasto, ...ligada });
    }

    await db
      .update(perguntasPendentes)
      .set({ status: 'respondida', respondidaEm: new Date().toISOString() })
      .where(eq(perguntasPendentes.id, perguntaId));
  });
}

export const perguntasRepositorySqlite: PerguntasRepository = {
  listarPendentes,
  responder,
};
