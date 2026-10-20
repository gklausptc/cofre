import { describe, expect, it } from '@jest/globals';
import { ehNomeProprio, juntarNomeProprio, lerNomesProprios } from '@/domain/usecases/importacao/nomesProprios';

const meus = ['GREGORY K SILVA PEREIRA'];

describe('ehNomeProprio', () => {
  it('reconhece o titular abreviado e cortado de jeitos diferentes', () => {
    expect(ehNomeProprio('GREGORY KLAUS DA SILVA PE', meus)).toBe(true);
    expect(ehNomeProprio('GREGORY KLAUS DA SILVA PEREIRA', meus)).toBe(true);
    expect(ehNomeProprio('Gregory K. Silva', meus)).toBe(true);
    expect(ehNomeProprio('GREGORY PEREIRA', meus)).toBe(true);
  });

  it('não confunde parentes nem outras pessoas', () => {
    expect(ehNomeProprio('MARIA APARECIDA SOUZA', meus)).toBe(false);
    expect(ehNomeProprio('MARIA SILVA PEREIRA', meus)).toBe(false);
    expect(ehNomeProprio('GREGORY HOUSE', meus)).toBe(false);
    expect(ehNomeProprio('GREGORY K', meus)).toBe(false);
    expect(ehNomeProprio('GREGORY', meus)).toBe(false);
    expect(ehNomeProprio('GREGORY KLAUS', [])).toBe(false);
  });
});

describe('juntarNomeProprio', () => {
  it('guarda o titular novo e não repete', () => {
    expect(juntarNomeProprio([], 'Gregory K Silva Pereira')).toEqual(['GREGORY K SILVA PEREIRA']);
    expect(juntarNomeProprio(meus, 'GREGORY KLAUS DA SILVA PEREIRA')).toEqual(meus);
    expect(juntarNomeProprio(meus, null)).toEqual(meus);
    expect(lerNomesProprios('["A B"]')).toEqual(['A B']);
    expect(lerNomesProprios('lixo')).toEqual([]);
  });
});
