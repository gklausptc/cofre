import { describe, expect, it } from '@jest/globals';
import { is } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '@/data/db/schema';
import { TABELAS_PARA_LIMPAR } from '@/data/db/tabelasParaLimpar';

describe('"Limpar todos os dados"', () => {
  it('apaga todas as tabelas do schema (tabela nova tem que entrar na lista)', () => {
    const doSchema = Object.values(schema as Record<string, unknown>).filter((v): v is SQLiteTable => is(v, SQLiteTable));
    const naLista = new Set(TABELAS_PARA_LIMPAR.map((t) => getTableConfig(t).name));
    const faltando = doSchema.map((t) => getTableConfig(t).name).filter((nome) => !naLista.has(nome));
    expect(faltando).toEqual([]);
    expect(naLista.size).toBe(doSchema.length);
  });
});
