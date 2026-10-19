import { describe, expect, it } from '@jest/globals';
import { gerarRecorrencia } from '@/domain/usecases/gerarRecorrencia';
import { umaContaFixa, umaParcela } from '@/test/fabricas';

const hoje = new Date(2026, 2, 15); // 15/03/2026 → janela de março a maio

describe('gerarRecorrencia', () => {
  it('mensal: cria uma ocorrência por mês nos próximos 3 meses', () => {
    const conta = umaContaFixa({ id: 1, valor: 120, recorrencia: 'mensal', dataInicio: '2026-01-10' });
    const novas = gerarRecorrencia([conta], [], hoje);

    expect(novas.map((p) => p.mesReferencia)).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(novas.every((p) => p.contaFixaId === 1 && p.compraParceladaId === null)).toBe(true);
    expect(novas.every((p) => p.valor === 120 && p.status === 'pendente')).toBe(true);
  });

  it('não duplica o que já foi gerado', () => {
    const conta = umaContaFixa({ id: 1, recorrencia: 'mensal', dataInicio: '2026-01-10' });
    const existente = umaParcela({ contaFixaId: 1, mesReferencia: '2026-03' });

    expect(gerarRecorrencia([conta], [existente], hoje).map((p) => p.mesReferencia)).toEqual(['2026-04', '2026-05']);
  });

  it('rodar duas vezes no mesmo dia não cria nada na segunda', () => {
    const conta = umaContaFixa({ id: 1, recorrencia: 'mensal', dataInicio: '2026-01-10' });
    const primeira = gerarRecorrencia([conta], [], hoje).map((p, i) => umaParcela({ ...p, id: i + 1 }));

    expect(gerarRecorrencia([conta], primeira, hoje)).toEqual([]);
  });

  it('quinzenal gera 2 por mês e semanal gera 4', () => {
    const quinzenal = umaContaFixa({ id: 1, recorrencia: 'quinzenal', dataInicio: '2026-01-01' });
    const semanal = umaContaFixa({ id: 2, recorrencia: 'semanal', dataInicio: '2026-01-01' });
    const novas = gerarRecorrencia([quinzenal, semanal], [], hoje);

    const daQuinzenal = novas.filter((p) => p.contaFixaId === 1);
    expect(daQuinzenal).toHaveLength(6);
    expect(daQuinzenal.filter((p) => p.mesReferencia === '2026-03').map((p) => p.numero)).toEqual([1, 2]);
    expect(novas.filter((p) => p.contaFixaId === 2)).toHaveLength(12);
  });

  it('anual só gera no mês de aniversário', () => {
    const conta = umaContaFixa({ id: 1, recorrencia: 'anual', dataInicio: '2025-04-01' });
    expect(gerarRecorrencia([conta], [], hoje).map((p) => p.mesReferencia)).toEqual(['2026-04']);
  });

  it('única gera uma ocorrência no mês de início, só uma vez', () => {
    const conta = umaContaFixa({ id: 1, recorrencia: 'unica', dataInicio: '2026-07-01' });
    expect(gerarRecorrencia([conta], [], hoje).map((p) => p.mesReferencia)).toEqual(['2026-07']);

    const jaGerada = umaParcela({ contaFixaId: 1, mesReferencia: '2026-07' });
    expect(gerarRecorrencia([conta], [jaGerada], hoje)).toEqual([]);
  });

  it('ignora contas inativas', () => {
    const conta = umaContaFixa({ id: 1, ativo: false, dataInicio: '2026-01-01' });
    expect(gerarRecorrencia([conta], [], hoje)).toEqual([]);
  });

  it('respeita data de início no futuro e data de fim', () => {
    const futura = umaContaFixa({ id: 1, dataInicio: '2026-05-01' });
    const terminando = umaContaFixa({ id: 2, dataInicio: '2026-01-10', dataFim: '2026-04-30' });
    const novas = gerarRecorrencia([futura, terminando], [], hoje);

    expect(novas.filter((p) => p.contaFixaId === 1).map((p) => p.mesReferencia)).toEqual(['2026-05']);
    expect(novas.filter((p) => p.contaFixaId === 2).map((p) => p.mesReferencia)).toEqual(['2026-03', '2026-04']);
  });

  it('mensal com fim (financiamento) numera pela sequência de meses desde o início', () => {
    const financiamento = umaContaFixa({ id: 1, dataInicio: '2026-01-10', dataFim: '2029-12-10' });
    expect(gerarRecorrencia([financiamento], [], hoje).map((p) => p.numero)).toEqual([3, 4, 5]);
  });
});
