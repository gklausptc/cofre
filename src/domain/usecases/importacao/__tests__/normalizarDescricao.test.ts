import { describe, expect, it } from '@jest/globals';
import { normalizarDescricao } from '@/domain/usecases/importacao/normalizarDescricao';

describe('normalizarDescricao', () => {
  it('maiúsculas, sem acentos e sem espaços sobrando', () => {
    expect(normalizarDescricao('  Padaria   São José ').normalizada).toBe('PADARIA SAO JOSE');
  });

  it('PIX: tira o prefixo, guarda o nome e o sentido', () => {
    expect(normalizarDescricao('PIX ENVIADO PARA Maria da Silva 123.456.789-00')).toMatchObject({
      normalizada: 'MARIA DA SILVA',
      pix: { sentido: 'enviado', nome: 'MARIA DA SILVA' },
    });
    expect(normalizarDescricao('Pix recebido de João Souza')).toMatchObject({
      normalizada: 'JOAO SOUZA',
      pix: { sentido: 'recebido', nome: 'JOAO SOUZA' },
    });
  });

  it('compra no cartão: tira o prefixo, o intermediador, a data e a hora', () => {
    expect(normalizarDescricao('COMPRA CARTAO IFD*PIZZARIA BELLA 12/10 19:32')).toMatchObject({
      normalizada: 'PIZZARIA BELLA',
      intermediador: 'IFD',
      pix: null,
    });
    expect(normalizarDescricao('PG *MERCADO BOM PRECO').normalizada).toBe('MERCADO BOM PRECO');
    expect(normalizarDescricao('UBER *TRIP 12/10').normalizada).toBe('UBER TRIP');
  });

  it('separa a marca de parcela nos três formatos', () => {
    expect(normalizarDescricao('MP *MERCADOLIVRE 03/06')).toMatchObject({
      normalizada: 'MERCADOLIVRE',
      intermediador: 'MP',
      parcela: { numero: 3, total: 6 },
    });
    expect(normalizarDescricao('AMAZON MKTPLACE PARC 3/10')).toMatchObject({
      normalizada: 'AMAZON MKTPLACE',
      parcela: { numero: 3, total: 10 },
    });
    expect(normalizarDescricao('LOJA X 3 DE 12').parcela).toEqual({ numero: 3, total: 12 });
  });

  it('número que não pode ser parcela (12/10) fica como data e sai do texto', () => {
    expect(normalizarDescricao('POSTO SHELL 12/10').parcela).toBeNull();
  });

  it('tira códigos de autorização, documento e números longos', () => {
    expect(normalizarDescricao('PAGAMENTO DE BOLETO ENEL SP 0012345678901').normalizada).toBe('ENEL SP');
    expect(normalizarDescricao('Supermercado Extra AUT 123456').normalizada).toBe('SUPERMERCADO EXTRA');
  });
});
