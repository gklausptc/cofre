import { describe, expect, it } from '@jest/globals';
import { deduplicar, hashTexto, idExternoDeLinhas, semelhanca } from '@/domain/usecases/importacao/deduplicar';
import type { TransacaoLida } from '@/domain/usecases/importacao/tipos';

function transacao(dados: Partial<TransacaoLida>): TransacaoLida {
  return { data: '2026-10-10', descricao: 'X', valor: -1000, idExterno: 'x', parcela: null, linha: 1, ...dados };
}

describe('hash e id externo', () => {
  it('hash estável', () => {
    expect(hashTexto('abc')).toBe(hashTexto('abc'));
    expect(hashTexto('abc')).not.toBe(hashTexto('abd'));
    expect(hashTexto('abc')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('mesma linha gera o mesmo id; linhas idênticas no mesmo arquivo ganham ids diferentes', () => {
    const cafe = { data: '2026-10-10', valor: -500, descricao: 'Cafeteria' };
    const ids = idExternoDeLinhas([cafe, cafe, { ...cafe, valor: -600 }], 'csv:nubank');
    expect(new Set(ids).size).toBe(3);
    expect(idExternoDeLinhas([cafe, cafe], 'csv:nubank')).toEqual(ids.slice(0, 2));
    // descrição com outro "ruído" (data, código) é a mesma linha
    expect(idExternoDeLinhas([{ ...cafe, descricao: 'CAFETERIA 10/10 AUT 123456' }], 'csv:nubank')[0]).toBe(ids[0]);
  });
});

describe('semelhanca', () => {
  it('iguais depois de normalizar valem 1; uma contida na outra vale ao menos 0,8', () => {
    expect(semelhanca('Padaria São José', 'PADARIA SAO JOSE 10/10')).toBe(1);
    expect(semelhanca('Mercado', 'SUPERMERCADO EXTRA')).toBeGreaterThanOrEqual(0.8);
  });

  it('textos diferentes ficam baixo', () => {
    expect(semelhanca('Farmácia', 'Posto Shell')).toBeLessThan(0.4);
  });
});

describe('deduplicar', () => {
  const existentes = [
    { id: 'mov-1', data: '2026-10-09', valor: -4590, descricao: 'Padaria São José', idExterno: null },
    { id: 'mov-2', data: '2026-10-10', valor: -12000, descricao: 'Mercado', idExterno: null },
    { id: 'mov-3', data: '2026-10-11', valor: -3000, descricao: 'Uber', idExterno: 'csv:nubank:abc' },
    { id: 'mov-4', data: '2026-10-12', valor: -9900, descricao: 'Academia', idExterno: null },
  ];

  it('mesmo id externo: já importada', () => {
    const [situacao] = deduplicar([transacao({ idExterno: 'csv:nubank:abc', valor: -3000 })], existentes);
    expect(situacao).toEqual({ tipo: 'ja_importada', existenteId: 'mov-3' });
  });

  it('mesmo valor, data ±2 dias e descrição quase igual: duplicata certa de lançamento manual', () => {
    const [situacao] = deduplicar([transacao({ data: '2026-10-10', valor: -4590, descricao: 'PADARIA SAO JOSE' })], existentes);
    expect(situacao).toMatchObject({ tipo: 'duplicata', existenteId: 'mov-1' });
  });

  it('parecida mas não igual: dúvida (vira pergunta)', () => {
    const [situacao] = deduplicar([transacao({ data: '2026-10-11', valor: -12000, descricao: 'SUPERMERCADO EXTRA' })], existentes);
    expect(situacao).toMatchObject({ tipo: 'duvida', existenteId: 'mov-2' });
  });

  it('mesmo valor no mesmo dia, descrição bem diferente: dúvida também', () => {
    const [situacao] = deduplicar([transacao({ data: '2026-10-12', valor: -9900, descricao: 'SMARTFIT' })], existentes);
    expect(situacao).toMatchObject({ tipo: 'duvida', existenteId: 'mov-4' });
  });

  it('valor diferente, ou mais de 2 dias de distância: nova', () => {
    expect(deduplicar([transacao({ valor: -4591, descricao: 'Padaria São José' })], existentes)).toEqual([{ tipo: 'nova' }]);
    expect(deduplicar([transacao({ data: '2026-10-20', valor: -4590, descricao: 'Padaria São José' })], existentes)).toEqual([
      { tipo: 'nova' },
    ]);
  });

  it('um lançamento existente casa com uma transação só', () => {
    const duas = [
      transacao({ idExterno: 'a', data: '2026-10-09', valor: -4590, descricao: 'Padaria São José' }),
      transacao({ idExterno: 'b', data: '2026-10-09', valor: -4590, descricao: 'Padaria São José' }),
    ];
    expect(deduplicar(duas, existentes).map((s) => s.tipo)).toEqual(['duplicata', 'nova']);
  });

  it('o que casa por id externo não é usado na comparação por semelhança', () => {
    const lista = [
      transacao({ idExterno: 'novo', data: '2026-10-11', valor: -3000, descricao: 'Uber' }),
      transacao({ idExterno: 'csv:nubank:abc', data: '2026-10-11', valor: -3000, descricao: 'Uber' }),
    ];
    expect(deduplicar(lista, existentes).map((s) => s.tipo)).toEqual(['nova', 'ja_importada']);
  });
});

describe('parcelas com a data da compra original (C6, Itaú)', () => {
  it('3/10 e 4/10 da mesma compra têm ids diferentes', () => {
    const base = { data: '2026-07-20', valor: 19590, descricao: 'MAGAZINE LUIZA' };
    const [terceira] = idExternoDeLinhas([{ ...base, parcela: { numero: 3, total: 10 } }], 'h:c6');
    const [quarta] = idExternoDeLinhas([{ ...base, parcela: { numero: 4, total: 10 } }], 'h:c6');
    expect(terceira).not.toBe(quarta);
    // linha sem parcela mantém o id de antes
    expect(idExternoDeLinhas([base], 'h:c6')).toEqual(idExternoDeLinhas([{ ...base, parcela: null }], 'h:c6'));
  });

  it('parcela diferente nunca é duplicata da anterior', () => {
    const existente = { id: 'gasto-1', data: '2026-07-20', valor: 19590, descricao: 'MAGAZINE LUIZA 03/10', idExterno: 'outro' };
    const [r] = deduplicar([transacao({ data: '2026-07-20', valor: 19590, descricao: 'MAGAZINE LUIZA 04/10', idExterno: 'novo' })], [existente]);
    expect(r).toEqual({ tipo: 'nova' });
  });
});
