import { describe, expect, it } from '@jest/globals';
import {
  ehPlanilhaDoCofre,
  lerMes,
  lerParcela,
  lerPlanilhaDoCofre,
  montarPlanilhaDoCofre,
  montarRegistroDaPlanilha,
  planejarPlanilha,
} from '@/domain/usecases/importacao/planilhaDoCofre';
import { umCartao, umaCategoria, umaConta, umaFatura, umaMovimentacao, umGasto } from '@/test/fabricas';

// dados inventados
const planilha = [
  'Data;Conta ou cartão;Tipo;Descrição;Categoria;Valor;Destino;Fatura;Parcela;Membro;Observação',
  ';Corrente;Conta;Banco Exemplo;;0,00;;;;;',
  ';Poupança;Conta;Banco Exemplo;;20,00;;;;;',
  ';Cartão X;Cartão;fecha dia 1, vence dia 10;;2.000,00;;;;;',
  '05/01/2026;Poupança;Entrada;Pix recebido;Salário;2.400,00;;;;;todo mês',
  '06/01/2026;Poupança;Transferência;Para a corrente;;300,00;Corrente;;;;',
  '06/01/2026;Corrente;Saída;"Padaria ""Boa"";Centro";Alimentação;12,50;;;;;',
  '07/01/2026;Corrente;Saída para conta sua;PIX para minha outra conta;;50,00;;;;;',
  '15/01/2026;Cartão X;Compra no cartão;Loja (2/3);Compras;100,00;;2026-02;2/3;;',
  '20/01/2026;Cartão X;Crédito no cartão;Estorno;Compras;10,00;;2026-02;;;',
  '09/02/2026;Poupança;Pagamento de fatura;Pix para o cartão;;60,00;Cartão X;2026-02;;;',
  '10/02/2026;Corrente;Pagamento de fatura;Pix para o cartão;;30,00;Cartão X;2026-02;;;',
  '10/03/2026;Cartão X;Fatura paga;;;45,00;;2026-03;;;',
  '10/03/2026;Corrente;Vale-refeição;;;5,00;;;;;',
].join('\r\n');

describe('lerPlanilhaDoCofre', () => {
  const { linhas, erros } = lerPlanilhaDoCofre(`﻿${planilha}`);

  it('reconhece o cabeçalho e lê cada linha, com aspas e ponto e vírgula dentro', () => {
    expect(ehPlanilhaDoCofre(planilha)).toBe(true);
    expect(ehPlanilhaDoCofre('data;descricao;valor')).toBe(false);
    expect(linhas).toHaveLength(12);
    expect(linhas[5]).toMatchObject({ tipo: 'saida', descricao: 'Padaria "Boa";Centro', valor: 1250, categoria: 'Alimentação' });
    expect(linhas[7]).toMatchObject({ tipo: 'compra_cartao', fatura: '2026-02', parcela: { numero: 2, total: 3 } });
  });

  it('diz o que está errado em cada linha', () => {
    expect(erros).toEqual([{ numero: 14, motivo: 'Tipo "Vale-refeição" não reconhecido' }]);
    const comFalta = lerPlanilhaDoCofre(
      ['Data;Conta ou cartão;Tipo;Descrição;Categoria;Valor;Destino;Fatura', '01/01/2026;Corrente;Transferência;x;;10,00;;', ';Corrente;Entrada;x;;10,00;;', '02/01/2026;C;Pagamento de fatura;x;;10;Cartão;'].join('\n')
    );
    expect(comFalta.erros.map((e) => e.motivo)).toEqual([
      'Transferência sem a conta de destino',
      'Falta a data',
      'Diga de que fatura é (coluna Fatura, aaaa-mm)',
    ]);
  });
});

describe('planejarPlanilha e montarRegistroDaPlanilha', () => {
  const { linhas } = lerPlanilhaDoCofre(planilha);
  const salario = umaCategoria({ id: 1, nome: 'Salário', tipo: 'receita' });

  it('prévia: o que cria e os totais', () => {
    const plano = planejarPlanilha(linhas, { contas: [], cartoes: [], categorias: [salario], membros: [] });
    expect(plano.contasNovas).toEqual([
      { nome: 'Corrente', banco: 'Banco Exemplo', saldoInicial: 0 },
      { nome: 'Poupança', banco: 'Banco Exemplo', saldoInicial: 2000 },
    ]);
    expect(plano.cartoesNovos).toEqual([{ nome: 'Cartão X', limite: 200000, diaFechamento: 1, diaVencimento: 10 }]);
    expect(plano.categoriasNovas).toEqual([
      { nome: 'Alimentação', tipo: 'despesa' },
      { nome: 'Compras', tipo: 'despesa' },
    ]);
    expect(plano.totais).toEqual({ entradas: 240000, saidas: 1250, transferencias: 30000, comprasNoCartao: 9000, pagamentosDeFatura: 13500 });
    expect(plano.periodo).toEqual({ inicio: '2026-01-05', fim: '2026-03-10' });
  });

  it('cada linha vira o lançamento certo, e reimportar não duplica', () => {
    const ids = {
      contas: [umaConta({ id: 1, nomeConta: 'Corrente' }), umaConta({ id: 2, nomeConta: 'Poupança' })],
      cartoes: [umCartao({ id: 7, nome: 'Cartão X', diaFechamento: 1, diaVencimento: 10 })],
      categorias: [salario, umaCategoria({ id: 2, nome: 'Alimentação', tipo: 'despesa' }), umaCategoria({ id: 3, nome: 'Compras', tipo: 'despesa' })],
      membros: [],
      idsExternos: new Set<string>(),
    };
    const registro = montarRegistroDaPlanilha(linhas, ids, { arquivo: 'cofre.csv', criadaEm: '2026-10-20T10:00:00Z' });
    expect(registro.movimentacoes.map((m) => [m.contaBancariaId, m.tipo, m.origem, m.valor, m.categoriaId, m.contaDestinoId ?? null])).toEqual([
      [2, 'entrada', 'manual', 240000, 1, null],
      [2, 'transferencia', 'manual', 30000, null, 1],
      [1, 'saida', 'manual', 1250, 2, null],
      [1, 'saida', 'interna', 5000, null, null],
    ]);
    // a compra de 15/01 vai para a fatura de fevereiro: a data passa a ser o fechamento dela
    expect(registro.gastos.map((g) => [g.cartaoId, g.valor, g.data, g.descricao])).toEqual([
      [7, 10000, '2026-01-15', 'Loja (2/3)'],
      [7, -1000, '2026-01-20', 'Estorno'],
    ]);
    expect(registro.pagamentosDeFatura.map((p) => [p.saida.contaBancariaId, p.saida.valor, p.saida.origem, p.pagamento.mesReferencia, p.pagamento.valorPago])).toEqual([
      [2, 6000, 'fatura', '2026-02', 9000],
      [1, 3000, 'fatura', '2026-02', 9000],
    ]);
    expect(registro.faturasPagas).toEqual([
      expect.objectContaining({ cartaoId: 7, mesReferencia: '2026-03', valorPago: 4500, contaBancariaId: null, dataVencimento: '2026-03-10' }),
    ]);
    expect(registro.importacao).toMatchObject({ formato: 'csv', totalLinhas: 9, importadas: 9, ignoradas: 0 });

    const jaNoApp = new Set(
      [...registro.movimentacoes, ...registro.gastos, ...registro.pagamentosDeFatura.map((p) => p.saida)].map((l) => l.idExterno as string)
    );
    const deNovo = montarRegistroDaPlanilha(linhas, { ...ids, idsExternos: jaNoApp }, { arquivo: 'cofre.csv', criadaEm: '2026-10-21T10:00:00Z' });
    expect(deNovo.movimentacoes).toHaveLength(0);
    expect(deNovo.gastos).toHaveLength(0);
    expect(deNovo.pagamentosDeFatura).toHaveLength(0);
    expect(deNovo.jaImportadas).toBe(8);
  });
});

describe('montarPlanilhaDoCofre (exportar e importar de volta)', () => {
  it('as contas, os lançamentos e as faturas pagas voltam iguais', () => {
    const corrente = umaConta({ id: 1, nomeConta: 'Corrente', banco: 'Banco Exemplo', saldoInicial: 1000 });
    const poupanca = umaConta({ id: 2, nomeConta: 'Poupança', banco: 'Banco Exemplo', saldoInicial: 0 });
    const cartao = umCartao({ id: 1, nome: 'Cartão X', diaFechamento: 1, diaVencimento: 10, limite: 50000 });
    const mercado = umaCategoria({ id: 5, nome: 'Mercado', tipo: 'despesa' });
    const fatura = umaFatura({ id: 3, cartaoId: 1, mesReferencia: '2026-02', status: 'paga', valorPago: 4000, dataPagamento: '2026-02-09' });
    const csv = montarPlanilhaDoCofre({
      contas: [corrente, poupanca],
      cartoes: [cartao],
      categorias: [mercado],
      membros: [],
      movimentacoes: [
        umaMovimentacao({ id: 1, contaBancariaId: 2, tipo: 'transferencia', contaDestinoId: 1, valor: 5000, data: '2026-01-06', descricao: 'Da poupança' }),
        umaMovimentacao({ id: 2, contaBancariaId: 1, tipo: 'saida', origem: 'fatura', faturaId: 3, valor: 4000, data: '2026-02-09', descricao: 'Fatura' }),
      ],
      gastos: [umGasto({ id: 1, valor: 4000, data: '2026-01-15', formaPagamento: 'cartao', cartaoId: 1, categoriaId: 5, descricao: 'Mercado do bairro' })],
      parcelas: [],
      comprasParceladas: [],
      contasFixas: [],
      faturas: [fatura],
    });
    const { linhas, erros } = lerPlanilhaDoCofre(csv);
    expect(erros).toEqual([]);
    expect(linhas.map((l) => [l.tipo, l.onde, l.valor, l.destino, l.fatura])).toEqual([
      ['conta', 'Corrente', 1000, null, null],
      ['conta', 'Poupança', 0, null, null],
      ['cartao', 'Cartão X', 50000, null, null],
      ['transferencia', 'Poupança', 5000, 'Corrente', null],
      ['compra_cartao', 'Cartão X', 4000, null, '2026-02'],
      ['pagamento_fatura', 'Corrente', 4000, 'Cartão X', '2026-02'],
    ]);
    expect(planejarPlanilha(linhas, { contas: [], cartoes: [], categorias: [], membros: [] }).cartoesNovos).toEqual([
      { nome: 'Cartão X', limite: 50000, diaFechamento: 1, diaVencimento: 10 },
    ]);
  });
});

describe('o que o Excel grava de volta', () => {
  it('mês da fatura e parcela que viraram data', () => {
    expect(['2026-10', '10/2026', 'out/26', 'out-2026', 'outubro de 2026', '01/10/2026', '2026-10-01', 'Out/26'].map(lerMes)).toEqual(Array(8).fill('2026-10'));
    expect(lerMes('13/2026')).toBeNull();
    expect(['3/4', '3 de 4', '03/abr', '3-abr'].map(lerParcela)).toEqual(Array(4).fill({ numero: 3, total: 4 }));
    expect(lerParcela('três')).toBeNull();
  });
});
