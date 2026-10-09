import { eq, inArray } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { comprasParceladas, cartoes, parcelas } from '@/data/db/schema';
import { inserirParcelas, listarParcelasPorCompra } from './parcelasRepository';
import { gerarParcelas } from '@/domain/usecases/gerarParcelas';
import { editarParcelamento } from '@/domain/usecases/editarParcelamento';
import type { NovaCompraParcelada } from '@/domain/types/entities';

export async function listarComprasParceladas() {
  return db.select().from(comprasParceladas).where(eq(comprasParceladas.ativo, true));
}

export async function listarComprasPorCartao(cartaoId: number) {
  return db.select().from(comprasParceladas).where(eq(comprasParceladas.cartaoId, cartaoId));
}

export async function criarCompraParcelada(
  dados: Omit<NovaCompraParcelada, 'id' | 'ativo'>,
  mesPrimeiraParcela?: string
) {
  const [cartao] = await db.select().from(cartoes).where(eq(cartoes.id, dados.cartaoId));
  if (!cartao) throw new Error('Cartão não encontrado');

  const [compra] = await db.insert(comprasParceladas).values(dados).returning();
  await inserirParcelas(gerarParcelas(compra, cartao, mesPrimeiraParcela));
  return compra;
}

export type DadosEdicaoCompra = {
  descricao: string;
  valorTotal: number;
  numParcelas: number;
  dataCompra: string;
  /** Mês de fechamento da fatura da 1ª parcela ('YYYY-MM'). */
  mesPrimeiraParcela: string;
  categoriaId: number | null;
  membroId: number | null;
};

/**
 * Edita a compra e recalcula só as parcelas pendentes (ver `editarParcelamento`).
 * Lança erro com a mensagem da regra de negócio se a edição for inválida.
 */
export async function editarCompraParcelada(id: number, dados: DadosEdicaoCompra) {
  const [compra] = await db.select().from(comprasParceladas).where(eq(comprasParceladas.id, id));
  if (!compra) throw new Error('Compra não encontrada');
  const [cartao] = await db.select().from(cartoes).where(eq(cartoes.id, compra.cartaoId));
  if (!cartao) throw new Error('Cartão não encontrado');

  const parcelasDaCompra = await listarParcelasPorCompra(id);
  const resultado = editarParcelamento(compra, parcelasDaCompra, {
    valorTotal: dados.valorTotal,
    numParcelas: dados.numParcelas,
    mesPrimeiraParcela: dados.mesPrimeiraParcela,
  });
  if (!resultado.ok) throw new Error(resultado.erro);

  const { atualizar, remover, criar } = resultado.plano;
  const { mesPrimeiraParcela: _mes, ...camposDaCompra } = dados;
  await db.update(comprasParceladas).set(camposDaCompra).where(eq(comprasParceladas.id, id));
  for (const item of atualizar) {
    await db
      .update(parcelas)
      .set({ numero: item.numero, valor: item.valor, mesReferencia: item.mesReferencia })
      .where(eq(parcelas.id, item.id));
  }
  if (remover.length > 0) await db.delete(parcelas).where(inArray(parcelas.id, remover));
  await inserirParcelas(criar);
}
