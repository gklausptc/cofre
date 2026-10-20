/**
 * Formatos reais de 2025–2026 levantados na pesquisa (dados fictícios, estrutura igual à dos
 * arquivos exportados pelos bancos).
 */
import { describe, expect, it } from '@jest/globals';
import { lerExtrato } from '@/domain/usecases/importacao/lerExtrato';
import { decodificarLatin1 } from '@/core/utils/importParsers';

function lerOk(conteudo: string, nome: string) {
  const resultado = lerExtrato(conteudo, nome);
  if (!resultado.ok) throw new Error(`esperava leitura: ${resultado.motivo}`);
  return resultado.extrato;
}

const valores = (conteudo: string, nome: string) => lerOk(conteudo, nome).transacoes.map((t) => [t.data, t.descricao, t.valor]);

describe('Banco do Brasil', () => {
  it('CSV da conta: descarta "Saldo Anterior", "Saldo do dia" (data 00/00/0000) e "S A L D O"', () => {
    const csv = [
      '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"',
      '"30/09/2026","Saldo Anterior","","","1.234,56",""',
      '"01/10/2026","Pix - Enviado","01/10 12:05 PADARIA EXEMPLO","70101","-25,90","Saída"',
      '"00/00/0000","Saldo do dia","","","1.208,66",""',
      '"02/10/2026","Pix - Recebido","02/10 08:00 FULANO","70102","100,00","Entrada"',
      '"02/10/2026","S A L D O","","","1.308,66",""',
    ].join('\r\n');
    const extrato = lerOk(csv, 'extrato.csv');
    expect(extrato).toMatchObject({ banco: 'bb', origem: 'conta', ignoradas: 3 });
    expect(extrato.transacoes.map((t) => t.valor)).toEqual([-2590, 10000]);
  });

  it('TXT da fatura Ourocard (largura fixa): compras, parcela no texto e vencimento', () => {
    const txt = [
      'OUROCARD VISA',
      'Vencimento      : 16.11.2026',
      'Total da fatura : R$ 209,06',
      'Data  Transações                          País  Valor R$  Valor US$',
      '1 - FULANO EXEMPLO',
      '01.10.2026SALDO FATURA ANTERIOR                          1.500,00        0,00',
      '15.10.2026PADARIA EXEMPLO        SAO PAULO     BR              25,90        0,00',
      '23.06.2026LOJA EX      PARC 05/06 SAO PAULO    BR             183,16        0,00',
      '20.10.2026PAGAMENTO RECEBIDO                               -1.500,00        0,00',
      'SubTotal                                                       209,06',
    ].join('\n');
    const extrato = lerOk(txt, 'fatura.txt');
    expect(extrato).toMatchObject({ formato: 'txt', banco: 'bb', origem: 'cartao', vencimentoFatura: '2026-11-16' });
    expect(extrato.transacoes.map((t) => [t.data, t.descricao, t.valor])).toEqual([
      ['2026-10-15', 'PADARIA EXEMPLO SAO PAULO', 2590],
      ['2026-06-23', 'LOJA EX PARC 05/06 SAO PAULO', 18316],
      ['2026-10-20', 'PAGAMENTO RECEBIDO', -150000],
    ]);
  });

  it('Windows-1252: o travessão e as aspas curvas viram os caracteres certos', () => {
    expect(decodificarLatin1(new Uint8Array([0x96, 0x20, 0x93, 0x4f, 0x94]))).toBe('– “O”');
  });
});

describe('C6 Bank', () => {
  it('CSV da conta: 8 linhas de título antes do cabeçalho, entrada e saída em colunas', () => {
    const csv = [
      'EXTRATO DE CONTA CORRENTE C6 BANK',
      '',
      'Agência: 1 / Conta: 12345678',
      'Extrato gerado em 16/10/2026 - as 15:26:31',
      '',
      'Extrato de 01/10/2026 a 16/10/2026',
      '',
      '',
      'Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)',
      '02/10/2026,02/10/2026,Pix recebido de EMPRESA EXEMPLO,Pix recebido de EMPRESA EXEMPLO,3500.00,0.00,3500.00',
      '03/10/2026,03/10/2026,"DEBITO DE CARTAO ",PADARIA EXEMPLO SAO PAULO BRA,0.00,25.90,3474.10',
    ].join('\n');
    expect(lerOk(csv, 'extrato.csv')).toMatchObject({ banco: 'c6', origem: 'conta' });
    expect(valores(csv, 'extrato.csv')).toEqual([
      ['2026-10-02', 'Pix recebido de EMPRESA EXEMPLO', 350000],
      ['2026-10-03', 'DEBITO DE CARTAO - PADARIA EXEMPLO SAO PAULO BRA', -2590],
    ]);
  });

  it('fatura: o vencimento vem do nome do arquivo e pagamentos são negativos', () => {
    const csv = [
      'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)',
      '14/09/2026;FULANO;1234;Supermercados;PADARIA EXEMPLO;Única;0;0;25.90',
      '09/06/2026;FULANO;5678;Departamento;LOJA EXEMPLO;4/10;0;0;195.90',
      '20/09/2026;FULANO;1234;-;"Inclusao de Pagamento    ";Única;0;0;-1500.00',
    ].join('\r\n');
    const extrato = lerOk(csv, 'Fatura_2026-10-10.csv');
    expect(extrato.vencimentoFatura).toBe('2026-10-10');
    expect(extrato.transacoes.map((t) => [t.valor, t.parcela])).toEqual([
      [2590, null],
      [19590, { numero: 4, total: 10 }],
      [-150000, null],
    ]);
  });
});

describe('PicPay', () => {
  it('CSV da conta: sinal de menos tipográfico, "R$" e tipo + origem/destino na descrição', () => {
    const csv = [
      'data,hora,tipo,"origem / destino",valor,"forma de pagamento"',
      '2026-10-12,23:15,"Pix enviado","FULANA EXEMPLO","−R$ 7,50","Com saldo"',
      '2026-10-12,23:13,"Pix recebido","CLIENTE EXEMPLO","+R$ 8,00",',
      '2026-10-11,10:00,"Pagamento","LOJA X","−R$ 1.234,56","Com saldo + cartão"',
    ].join('\n');
    expect(lerOk(csv, 'extrato.csv')).toMatchObject({ banco: 'picpay', origem: 'conta' });
    expect(valores(csv, 'extrato.csv')).toEqual([
      ['2026-10-12', 'Pix enviado - FULANA EXEMPLO', -750],
      ['2026-10-12', 'Pix recebido - CLIENTE EXEMPLO', 800],
      ['2026-10-11', 'Pagamento - LOJA X', -123456],
    ]);
  });
});

describe('Itaú', () => {
  it('fatura em CSV (desde set/2025): data ISO, ponto decimal, parcela colada no texto', () => {
    const csv = 'data,lançamento,valor\n2026-10-05,PADARIA EXEMPLO,25.9\n2026-08-15,LOJA EXEMPLO      03/10,99.9\n2026-10-10,PAGAMENTO EFETUADO,-1234.56\n';
    expect(lerOk(csv, 'fatura.csv')).toMatchObject({ banco: 'itau', origem: 'cartao' });
    expect(lerOk(csv, 'fatura.csv').transacoes.map((t) => t.valor)).toEqual([2590, 9990, -123456]);
  });

  it('TXT da conta sem cabeçalho: data; histórico; valor', () => {
    const txt = '01/10/2026;SALDO ANTERIOR;1500,00\n02/10/2026;PIX TRANSF FULANO 02/10;-1393,05\n03/10/2026;REMUNERACAO;250,00\n';
    expect(valores(txt, 'extrato.txt')).toEqual([
      ['2026-10-02', 'PIX TRANSF FULANO 02/10', -139305],
      ['2026-10-03', 'REMUNERACAO', 25000],
    ]);
  });
});

describe('Bradesco', () => {
  it('conta: o bloco "Últimos Lançamentos" repete cabeçalho e lançamentos, que não entram duas vezes', () => {
    const csv = [
      'Agência: 1234-5 Conta: 12345-6',
      'Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)',
      '01/10/2026;SALDO ANTERIOR;;;;1.000,00',
      '01/10/2026;PIX RECEBIDO;0012345;1.500,00;;2.500,00',
      '02/10/2026;COMPRA ELO DEBITO VISTA;0010099;;56,50;2.443,50',
      'Total;;;1.500,00;56,50;',
      'Últimos Lançamentos',
      'Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)',
      '02/10/2026;COMPRA ELO DEBITO VISTA;0010099;;56,50;2.443,50',
      '03/10/2026;PAGTO ELETRON COBRANCA;0010100;;100,00;2.343,50',
    ].join('\n');
    expect(valores(csv, 'extrato.csv')).toEqual([
      ['2026-10-01', 'PIX RECEBIDO', 150000],
      ['2026-10-02', 'COMPRA ELO DEBITO VISTA', -5650],
      ['2026-10-03', 'PAGTO ELETRON COBRANCA', -10000],
    ]);
  });

  it('fatura: datas sem ano ganham o ano da fatura (dezembro numa fatura de janeiro = ano anterior)', () => {
    const csv = [
      'Data: 10/01/2026 Situação da Fatura: Fechada',
      'Data;Histórico;Valor(US$);Valor(R$)',
      '15/12;LOJA EXEMPLO;0,00;120,00',
      '05/01;POSTO EXEMPLO;0,00;200,00',
      '06/01;PAGAMENTO;0,00;-500,00',
    ].join('\n');
    expect(lerOk(csv, 'fatura.csv')).toMatchObject({ banco: 'bradesco', origem: 'cartao' });
    expect(lerOk(csv, 'fatura.csv').transacoes.map((t) => [t.data, t.valor])).toEqual([
      ['2025-12-15', 12000],
      ['2026-01-05', 20000],
      ['2026-01-06', -50000],
    ]);
  });
});

describe('Nubank', () => {
  it('fatura no formato novo de 2026: valores em reais com vírgula e "- " antes do número', () => {
    const csv = 'date,title,amount\n2026-09-14,Posto Exemplo,"180,00"\n2026-09-03,Loja Exemplo - Parcela 3/10,"99,90"\n2026-09-10,Pagamento recebido,"- 1.500,00"\n';
    expect(lerOk(csv, 'Nubank_2026-10-05.csv').transacoes.map((t) => t.valor)).toEqual([18000, 9990, -150000]);
    expect(lerOk(csv, 'Nubank_2026-10-05.csv').vencimentoFatura).toBe('2026-10-05');
  });
});

describe('formatos que não dá para ler', () => {
  it('Excel, zip e PDF pedem para exportar em CSV ou OFX', () => {
    expect(lerExtrato('PK\u0003\u0004...', 'fatura.xls')).toMatchObject({ ok: false, motivo: 'nao_suportado' });
    expect(lerExtrato('qualquer', 'Fatura.zip')).toMatchObject({ ok: false, motivo: 'nao_suportado' });
  });
});
