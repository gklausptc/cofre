import type { PerguntasRepository } from '@/domain/repositories/perguntasRepository';
import type { EfeitosDaImportacao } from '@/domain/repositories/importacoesRepository';
import type { PlanoDeResposta } from '@/domain/usecases/importacao/responderPergunta';
import type { JuncaoDePerguntas } from '@/domain/usecases/importacao/reavaliarPerguntas';
import type { LinhaDaPergunta, PerguntaNova } from '@/domain/types/perguntas';
import { and, desc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
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
      const destino = plano.transferencia.contaDestinoId;
      // perguntas juntam linhas de contas diferentes: a saída da própria conta escolhida não pode
      // virar transferência para ela mesma (fica "para fora do app")
      await db
        .update(movimentacoes)
        .set({ tipo: 'transferencia', contaDestinoId: destino, categoriaId: null })
        .where(
          and(nasMovimentacoes, eq(movimentacoes.tipo, 'saida'), destino !== null ? ne(movimentacoes.contaBancariaId, destino) : undefined)
        );
      if (destino !== null) {
        await db
          .update(movimentacoes)
          .set({ tipo: 'transferencia', contaDestinoId: null, categoriaId: null })
          .where(and(nasMovimentacoes, eq(movimentacoes.tipo, 'saida'), eq(movimentacoes.contaBancariaId, destino)));
      }
      const origem = plano.transferencia.origemDasEntradas;
      if (origem !== null) {
        // a entrada vira transferência da outra conta para esta (o SET usa os valores de antes);
        // a que entrou na própria conta de origem fica como entrada
        await db
          .update(movimentacoes)
          .set({
            tipo: 'transferencia',
            contaDestinoId: sql`${movimentacoes.contaBancariaId}`,
            contaBancariaId: origem,
            categoriaId: null,
          })
          .where(and(nasMovimentacoes, eq(movimentacoes.tipo, 'entrada'), ne(movimentacoes.contaBancariaId, origem)));
      } else {
        // veio de uma conta sua fora do app: continua entrada (soma no saldo), mas não é receita
        await db
          .update(movimentacoes)
          .set({ origem: 'interna', categoriaId: null })
          .where(and(nasMovimentacoes, eq(movimentacoes.tipo, 'entrada')));
      }
    }

    if (plano.apagarLinhas) {
      if (nasMovimentacoes) await db.delete(movimentacoes).where(nasMovimentacoes);
      if (nosGastos) await db.delete(gastosRapidos).where(nosGastos);
    }
    if (plano.apagarGastos.length > 0) {
      const apagados = await db.select().from(gastosRapidos).where(inArray(gastosRapidos.id, plano.apagarGastos));
      await db.delete(gastosRapidos).where(inArray(gastosRapidos.id, plano.apagarGastos));
      await anotarNaImportacao(importacaoId, (e) => {
        e.gastosApagados = [...(e.gastosApagados ?? []), ...apagados];
      });
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

export async function juntarPerguntas(juncao: JuncaoDePerguntas) {
  await emTransacao(async () => {
    await db
      .update(perguntasPendentes)
      .set({
        chave: juncao.chave,
        titulo: juncao.titulo,
        valor: juncao.valor,
        quantidade: juncao.quantidade,
        dados: JSON.stringify(juncao.dados),
      })
      .where(and(eq(perguntasPendentes.id, juncao.manterId), eq(perguntasPendentes.status, 'pendente')));
    if (juncao.juntarIds.length > 0) {
      await db.delete(perguntasPendentes).where(and(inArray(perguntasPendentes.id, juncao.juntarIds), eq(perguntasPendentes.status, 'pendente')));
    }
  });
}

export async function limparOrfas(): Promise<number> {
  const pendentes = await listarPendentes();
  if (pendentes.length === 0) return 0;
  // o que ainda existe: (importação, id externo) das movimentações e dos gastos importados
  const [movs, gastos] = await Promise.all([
    db.select({ importacaoId: movimentacoes.importacaoId, idExterno: movimentacoes.idExterno }).from(movimentacoes),
    db.select({ importacaoId: gastosRapidos.importacaoId, idExterno: gastosRapidos.idExterno }).from(gastosRapidos),
  ]);
  const existe = new Set([
    ...movs.map((m) => `movimentacao|${m.importacaoId}|${m.idExterno}`),
    ...gastos.map((g) => `gasto|${g.importacaoId}|${g.idExterno}`),
  ]);
  let removidas = 0;
  await emTransacao(async () => {
    for (const pergunta of pendentes) {
      let dados: PerguntaNova['dados'];
      try {
        dados = JSON.parse(pergunta.dados) as PerguntaNova['dados'];
      } catch {
        await db.delete(perguntasPendentes).where(eq(perguntasPendentes.id, pergunta.id));
        removidas++;
        continue;
      }
      // a dúvida de duplicidade é sobre uma linha que NÃO entrou: vale enquanto a importação existir
      if (dados.tipo === 'duplicidade') {
        const importacaoId = dados.linhas[0]?.importacaoId ?? pergunta.importacaoId;
        const [importacao] = importacaoId != null ? await db.select().from(importacoes).where(eq(importacoes.id, importacaoId)) : [];
        if (!importacao) {
          await db.delete(perguntasPendentes).where(eq(perguntasPendentes.id, pergunta.id));
          removidas++;
        }
        continue;
      }
      const vivas = dados.linhas.filter((l) => existe.has(`${l.onde}|${l.importacaoId}|${l.idExterno}`));
      if (vivas.length === 0) {
        await db.delete(perguntasPendentes).where(eq(perguntasPendentes.id, pergunta.id));
        removidas++;
      } else if (vivas.length < dados.linhas.length) {
        await db
          .update(perguntasPendentes)
          .set({ quantidade: vivas.length, dados: JSON.stringify({ ...dados, linhas: vivas }) })
          .where(eq(perguntasPendentes.id, pergunta.id));
      }
    }
  });
  return removidas;
}

export const perguntasRepositorySqlite: PerguntasRepository = {
  listarPendentes,
  responder,
  juntarPerguntas,
  limparOrfas,
};
