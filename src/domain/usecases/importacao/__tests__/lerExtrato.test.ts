import { describe, expect, it } from '@jest/globals';
import { lerExtrato, lerTabelaCsv, mapearColunasPeloCabecalho } from '@/domain/usecases/importacao/lerExtrato';
import { bancoPorCodigo, bancoPorTexto, origemPorNomeDoArquivo } from '@/domain/usecases/importacao/bancos';

/**
 * Fuso no formato do OFX, montado por partes: o Tailwind leria o texto literal como uma
 * classe e quebraria o CSS do app (ver tailwind.config.js).
 */
const FUSO = '[' + '-3:BRT' + ']';

function lerOk(conteudo: string, nome: string) {
  const resultado = lerExtrato(conteudo, nome);
  if (!resultado.ok) throw new Error(`esperava leitura: ${resultado.motivo}`);
  return resultado.extrato;
}

describe('bancos', () => {
  it('reconhece pelo código do OFX, pelo nome e pelo arquivo', () => {
    expect(bancoPorCodigo('001')).toBe('bb');
    expect(bancoPorCodigo('0336')).toBe('c6');
    expect(bancoPorCodigo('380')).toBe('picpay');
    expect(bancoPorTexto('Nu Pagamentos S.A.')).toBe('nubank');
    expect(bancoPorTexto('extrato_c6bank_out.csv')).toBe('c6');
    expect(bancoPorTexto('Banco do Brasil')).toBe('bb');
    expect(bancoPorTexto('Infinity Pay')).toBe('infinitepay');
    expect(bancoPorTexto('minha-planilha.csv')).toBeNull();
    expect(origemPorNomeDoArquivo('Fatura_C6_2026-10.csv')).toBe('cartao');
    expect(origemPorNomeDoArquivo('extrato-conta.ofx')).toBe('conta');
  });
});

describe('CSV genérico', () => {
  it('acha o cabeçalho depois de linhas de título e detecta ponto e vírgula', () => {
    const tabela = lerTabelaCsv('Extrato de conta corrente\r\nAgência: 1234;Conta: 5678\r\n\r\nData;Histórico;Valor\r\n05/10/2026;Padaria;-10,50\r\n');
    expect(tabela?.cabecalho).toEqual(['Data', 'Histórico', 'Valor']);
    expect(tabela?.linhaDoCabecalho).toBe(4);
    expect(tabela?.linhas).toEqual([['05/10/2026', 'Padaria', '-10,50']]);
  });

  it('mapeia colunas pelos nomes, ignorando saldo, dólar e nome do cartão', () => {
    expect(mapearColunasPeloCabecalho(['Data', 'Descrição', 'Valor', 'Saldo'])).toMatchObject({ data: 0, descricao: [1], valor: 2 });
    expect(mapearColunasPeloCabecalho(['Data', 'Histórico', 'Crédito (R$)', 'Débito (R$)', 'Saldo (R$)'])).toMatchObject({
      credito: 2,
      debito: 3,
    });
    expect(mapearColunasPeloCabecalho(['Data', 'Nome no Cartão', 'Descrição', 'Valor (em US$)', 'Valor (em R$)'])).toMatchObject({
      descricao: [2],
      valor: 4,
    });
    expect(mapearColunasPeloCabecalho(['Coluna A', 'Coluna B'])).toBeNull();
  });

  it('lê valores com vírgula, sinal, coluna de tipo e ignora linhas de saldo', () => {
    const extrato = lerOk(
      [
        'Data;Descrição;Valor;Tipo',
        '01/10/2026;Saldo anterior;1.000,00;C',
        '02/10/2026;Salário;5.000,00;C',
        '03/10/2026;Farmácia;45,90;D',
        '04/10/2026;Transferência;-200,00;',
        'data ruim;Algo;10,00;D',
      ].join('\n'),
      'extrato.csv'
    );
    expect(extrato.transacoes.map((t) => [t.data, t.descricao, t.valor])).toEqual([
      ['2026-10-02', 'Salário', 500000],
      ['2026-10-03', 'Farmácia', -4590],
      ['2026-10-04', 'Transferência', -20000],
    ]);
    expect(extrato.ignoradas).toBe(2);
    expect(extrato.periodo).toEqual({ inicio: '2026-10-02', fim: '2026-10-04' });
    expect(extrato.origem).toBe('conta');
  });

  it('CSV que o app não entende pede o mapeamento manual', () => {
    const resultado = lerExtrato('Coluna A;Coluna B\nx;y\n', 'planilha.csv');
    expect(resultado).toMatchObject({ ok: false, motivo: 'precisa_mapear' });
  });

  it('PDF e binário não são suportados', () => {
    expect(lerExtrato('%PDF-1.7', 'fatura.pdf')).toMatchObject({ ok: false, motivo: 'nao_suportado' });
  });
});

describe('layouts de bancos', () => {
  it('Nubank conta: usa o Identificador como id externo e o sinal do valor', () => {
    const extrato = lerOk(
      'Data,Valor,Identificador,Descrição\n05/10/2026,-23.90,6713b1c2-aaaa,Compra no débito - Padaria\n06/10/2026,1500.00,6713b1c2-bbbb,Transferência recebida pelo Pix - JOAO\n',
      'NU_12345_01OUT2026_31OUT2026.csv'
    );
    expect(extrato).toMatchObject({ banco: 'nubank', origem: 'conta' });
    expect(extrato.transacoes.map((t) => [t.valor, t.idExterno])).toEqual([
      [-2390, 'csv:nubank:id:6713b1c2-aaaa'],
      [150000, 'csv:nubank:id:6713b1c2-bbbb'],
    ]);
  });

  it('Nubank cartão: compra positiva, pagamento negativo', () => {
    const extrato = lerOk('date,title,amount\n2026-10-05,iFood,45.90\n2026-10-10,Pagamento recebido,-1200.00\n', 'Nubank_2026-11-05.csv');
    expect(extrato).toMatchObject({ banco: 'nubank', origem: 'cartao' });
    expect(extrato.transacoes.map((t) => t.valor)).toEqual([4590, -120000]);
  });

  it('C6 fatura: valor em reais (não o em dólar) e a coluna Parcela', () => {
    const extrato = lerOk(
      [
        'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)',
        '05/10/2026;GREGORY K;1234;Restaurante;IFD*PIZZARIA;Única;0;0;89,90',
        '15/08/2026;GREGORY K;1234;Eletro;LOJA X;3/10;0;0;150,00',
      ].join('\n'),
      'Fatura_2026-11-10.csv'
    );
    expect(extrato).toMatchObject({ banco: 'c6', origem: 'cartao' });
    expect(extrato.transacoes.map((t) => [t.descricao, t.valor, t.parcela])).toEqual([
      ['IFD*PIZZARIA', 8990, null],
      ['LOJA X', 15000, { numero: 3, total: 10 }],
    ]);
  });

  it('BB conta: junta Lançamento e Detalhes e usa Tipo Lançamento para o sinal', () => {
    const extrato = lerOk(
      [
        '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"',
        '"01/10/2026","Saldo Anterior","","","1.000,00",""',
        '"02/10/2026","Pix - Enviado","02/10 10:15 Maria Silva","123","150,00","Saída"',
        '"03/10/2026","Pix - Recebido","03/10 09:00 Joao","124","80,00","Entrada"',
      ].join('\n'),
      'extrato.csv'
    );
    expect(extrato).toMatchObject({ banco: 'bb', origem: 'conta' });
    expect(extrato.transacoes.map((t) => [t.descricao, t.valor])).toEqual([
      ['Pix - Enviado - 02/10 10:15 Maria Silva', -15000],
      ['Pix - Recebido - 03/10 09:00 Joao', 8000],
    ]);
  });

  it('Bradesco conta: colunas de crédito e débito', () => {
    const extrato = lerOk(
      ['Extrato de: Agência: 1234 Conta: 56789-0', 'Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)', '02/10/2026;PIX RECEBIDO;1;300,00;;1.300,00', '03/10/2026;CONTA DE LUZ;2;;120,50;1.179,50'].join('\n'),
      'Bradesco_Extrato.csv'
    );
    expect(extrato).toMatchObject({ banco: 'bradesco', origem: 'conta' });
    expect(extrato.transacoes.map((t) => t.valor)).toEqual([30000, -12050]);
  });
});

describe('OFX', () => {
  const conta = [
    'OFXHEADER:100',
    '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>001<ACCTID>12345-6</BANKACCTFROM><BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT',
    `<DTPOSTED>20261005120000${FUSO}`,
    '<TRNAMT>-50.00<FITID>A1<MEMO>Pix - Enviado<NAME>Maria Silva</STMTTRN>',
    '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>1500.50<FITID>A2<MEMO>Salario</STMTTRN>',
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
  ].join('\n');

  it('conta: banco pelo BANKID, FITID como id externo, MEMO e NAME juntos', () => {
    const extrato = lerOk(conta, 'extrato.ofx');
    expect(extrato).toMatchObject({ formato: 'ofx', banco: 'bb', origem: 'conta' });
    expect(extrato.transacoes.map((t) => [t.data, t.descricao, t.valor, t.idExterno])).toEqual([
      ['2026-10-05', 'Pix - Enviado Maria Silva', -5000, 'ofx:bb:12345-6:A1'],
      ['2026-10-06', 'Salario', 150050, 'ofx:bb:12345-6:A2'],
    ]);
  });

  it('cartão: compra vem negativa no OFX e vira positiva no app', () => {
    const cartao = conta
      .replace('<BANKMSGSRSV1>', '<CREDITCARDMSGSRSV1>')
      .replace('<STMTRS>', '<CCSTMTRS>')
      .replace('<BANKID>001', '<BANKID>336');
    const extrato = lerOk(cartao, 'fatura.ofx');
    expect(extrato).toMatchObject({ banco: 'c6', origem: 'cartao' });
    expect(extrato.transacoes.map((t) => t.valor)).toEqual([5000, -150050]);
  });

  it('FITID repetido em transações diferentes não vira o mesmo id', () => {
    const repetido = conta.replace('<FITID>A2', '<FITID>A1');
    const ids = lerOk(repetido, 'extrato.ofx').transacoes.map((t) => t.idExterno);
    expect(new Set(ids).size).toBe(2);
  });
});
