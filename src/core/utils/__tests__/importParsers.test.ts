import { describe, expect, it } from '@jest/globals';
import {
  decodificarLatin1,
  parseCSV,
  parseDataExtrato,
  parseOFX,
  parseValorMonetario,
  pareceArquivoBinario,
  removerBOM,
  temCaracteresInvalidos,
} from '@/core/utils/importParsers';

describe('parseCSV', () => {
  it('detecta ponto e vírgula, respeita aspas e ignora linhas vazias', () => {
    const csv = 'data;descricao;valor\r\n05/03/2026;"Padaria; centro";-10,50\r\n\r\n06/03/2026;Mercado;-20,00';

    expect(parseCSV(csv)).toEqual({
      headers: ['data', 'descricao', 'valor'],
      linhas: [
        ['05/03/2026', 'Padaria; centro', '-10,50'],
        ['06/03/2026', 'Mercado', '-20,00'],
      ],
    });
  });

  it('detecta vírgula como separador', () => {
    expect(parseCSV('a,b\n1,2').linhas).toEqual([['1', '2']]);
  });

  it('arquivo vazio', () => {
    expect(parseCSV('')).toEqual({ headers: [], linhas: [] });
  });
});

describe('parseValorMonetario', () => {
  it('entende o formato brasileiro e o com ponto decimal', () => {
    expect(parseValorMonetario('1.234,56')).toBe(1234.56);
    expect(parseValorMonetario('1234.56')).toBe(1234.56);
    expect(parseValorMonetario('-50,00')).toBe(-50);
    expect(parseValorMonetario('R$ 10,5')).toBe(10.5);
  });
});

describe('parseDataExtrato', () => {
  it('converte as datas comuns de extrato para ISO', () => {
    expect(parseDataExtrato('05/03/2026')).toBe('2026-03-05');
    expect(parseDataExtrato('5/3/26')).toBe('2026-03-05');
    expect(parseDataExtrato('2026-03-05T10:00:00')).toBe('2026-03-05');
  });

  it('recusa o que não é data', () => {
    expect(parseDataExtrato('ontem')).toBeNull();
  });
});

describe('parseOFX', () => {
  const ofx = [
    'OFXHEADER:100',
    '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
    '<STMTTRN>',
    '<TRNTYPE>DEBIT',
    '<DTPOSTED>20260305120000[-3:BRT]',
    '<TRNAMT>-50.00',
    '<FITID>123',
    '<MEMO>PADARIA DO ZE',
    '</STMTTRN>',
    '<STMTTRN>',
    '<DTPOSTED>20260306',
    '<TRNAMT>1500.5',
    '<NAME>SALARIO',
    '</STMTTRN>',
    '<STMTTRN>',
    '<DTPOSTED>20260307',
    '<MEMO>SEM VALOR',
    '</STMTTRN>',
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
  ].join('\r\n');

  it('lê data, valor com sinal e descrição (MEMO ou NAME); pula transação sem valor', () => {
    expect(parseOFX(ofx)).toEqual([
      { data: '2026-03-05', descricao: 'PADARIA DO ZE', valor: -50 },
      { data: '2026-03-06', descricao: 'SALARIO', valor: 1500.5 },
    ]);
  });
});

describe('codificação e tipo de arquivo', () => {
  it('decodifica Latin-1 byte a byte', () => {
    expect(decodificarLatin1(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
  });

  it('identifica texto lido com a codificação errada', () => {
    expect(temCaracteresInvalidos('caf�')).toBe(true);
    expect(temCaracteresInvalidos('café')).toBe(false);
  });

  it('identifica PDF e binários', () => {
    expect(pareceArquivoBinario('%PDF-1.7 ...')).toBe(true);
    expect(pareceArquivoBinario('abc\u0000def')).toBe(true);
    expect(pareceArquivoBinario('data;valor')).toBe(false);
  });

  it('remove o BOM do início', () => {
    expect(removerBOM('﻿abc')).toBe('abc');
    expect(removerBOM('abc')).toBe('abc');
  });
});
