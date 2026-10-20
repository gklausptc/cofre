import { describe, expect, it } from '@jest/globals';
import { editarParcelamento } from '@/domain/usecases/editarParcelamento';
import { umaParcela } from '@/test/fabricas';
import type { Parcela } from '@/domain/types/entities';

const compra = { id: 1 };

/** 4 parcelas de 25 (jan a abr), a 1ª já paga. */
function parcelamentoCom1Paga(): Parcela[] {
  return [
    umaParcela({ id: 11, compraParceladaId: 1, numero: 1, valor: 2500, mesReferencia: '2026-01', status: 'paga', dataPagamento: '2026-01-05' }),
    umaParcela({ id: 12, compraParceladaId: 1, numero: 2, valor: 2500, mesReferencia: '2026-02' }),
    umaParcela({ id: 13, compraParceladaId: 1, numero: 3, valor: 2500, mesReferencia: '2026-03' }),
    umaParcela({ id: 14, compraParceladaId: 1, numero: 4, valor: 2500, mesReferencia: '2026-04' }),
  ];
}

function planoOk(resultado: ReturnType<typeof editarParcelamento>) {
  if (!resultado.ok) throw new Error(`esperava sucesso: ${resultado.erro}`);
  return resultado.plano;
}

describe('editarParcelamento', () => {
  it('sem mudanças, recalcula as pendentes com os mesmos valores', () => {
    const plano = planoOk(
      editarParcelamento(compra, parcelamentoCom1Paga(), { valorTotal: 10000, numParcelas: 4, mesPrimeiraParcela: '2026-01' })
    );

    expect(plano.atualizar).toEqual([
      { id: 12, numero: 2, valor: 2500, mesReferencia: '2026-02' },
      { id: 13, numero: 3, valor: 2500, mesReferencia: '2026-03' },
      { id: 14, numero: 4, valor: 2500, mesReferencia: '2026-04' },
    ]);
    expect(plano.remover).toEqual([]);
    expect(plano.criar).toEqual([]);
  });

  it('nunca altera nem remove parcela paga', () => {
    const plano = planoOk(
      editarParcelamento(compra, parcelamentoCom1Paga(), { valorTotal: 7000, numParcelas: 2, mesPrimeiraParcela: '2026-03' })
    );

    expect(plano.atualizar.map((p) => p.id)).not.toContain(11);
    expect(plano.remover).not.toContain(11);
  });

  it('mais parcelas: divide o que falta pagar e cria as novas nos meses seguintes', () => {
    const plano = planoOk(
      editarParcelamento(compra, parcelamentoCom1Paga(), { valorTotal: 10000, numParcelas: 6, mesPrimeiraParcela: '2026-01' })
    );

    expect(plano.atualizar.map((p) => p.valor)).toEqual([1500, 1500, 1500]);
    expect(plano.criar.map((p) => [p.numero, p.valor, p.mesReferencia, p.status])).toEqual([
      [5, 1500, '2026-05', 'pendente'],
      [6, 1500, '2026-06', 'pendente'],
    ]);
    expect(plano.criar.every((p) => p.compraParceladaId === 1 && p.contaFixaId === null)).toBe(true);
  });

  it('menos parcelas: a pendente que sobra leva o restante e as demais são removidas', () => {
    const plano = planoOk(
      editarParcelamento(compra, parcelamentoCom1Paga(), { valorTotal: 10000, numParcelas: 2, mesPrimeiraParcela: '2026-01' })
    );

    expect(plano.atualizar).toEqual([{ id: 12, numero: 2, valor: 7500, mesReferencia: '2026-02' }]);
    expect(plano.remover).toEqual([13, 14]);
    expect(plano.criar).toEqual([]);
  });

  it('ajusta os centavos na última pendente', () => {
    const plano = planoOk(
      editarParcelamento(compra, parcelamentoCom1Paga(), { valorTotal: 9500, numParcelas: 4, mesPrimeiraParcela: '2026-01' })
    );

    expect(plano.atualizar.map((p) => p.valor)).toEqual([2333, 2333, 2334]);
  });

  it('parcela paga no meio mantém o número; as pendentes ocupam os números livres', () => {
    const parcelas = [
      umaParcela({ id: 21, compraParceladaId: 1, numero: 1, valor: 2500, mesReferencia: '2026-01' }),
      umaParcela({ id: 22, compraParceladaId: 1, numero: 2, valor: 2500, mesReferencia: '2026-02', status: 'paga' }),
      umaParcela({ id: 23, compraParceladaId: 1, numero: 3, valor: 2500, mesReferencia: '2026-03' }),
      umaParcela({ id: 24, compraParceladaId: 1, numero: 4, valor: 2500, mesReferencia: '2026-04' }),
    ];
    const plano = planoOk(editarParcelamento(compra, parcelas, { valorTotal: 10000, numParcelas: 4, mesPrimeiraParcela: '2026-01' }));

    expect(plano.atualizar.map((p) => [p.id, p.numero])).toEqual([
      [21, 1],
      [23, 3],
      [24, 4],
    ]);
  });

  it('muda o mês da primeira parcela e desloca as pendentes', () => {
    const plano = planoOk(
      editarParcelamento(compra, parcelamentoCom1Paga(), { valorTotal: 10000, numParcelas: 4, mesPrimeiraParcela: '2026-03' })
    );

    expect(plano.atualizar.map((p) => p.mesReferencia)).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('recusa número de parcelas que não passa das já pagas', () => {
    const resultado = editarParcelamento(compra, parcelamentoCom1Paga(), {
      valorTotal: 10000,
      numParcelas: 1,
      mesPrimeiraParcela: '2026-01',
    });

    expect(resultado.ok).toBe(false);
  });

  it('recusa valor total menor ou igual ao já pago', () => {
    const resultado = editarParcelamento(compra, parcelamentoCom1Paga(), {
      valorTotal: 2500,
      numParcelas: 4,
      mesPrimeiraParcela: '2026-01',
    });

    expect(resultado).toEqual({ ok: false, erro: expect.stringContaining('25,00') });
  });
});
