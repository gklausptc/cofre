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
import { umCartao, umaCategoria, umaCompra, umaConta, umaContaFixa, umaFatura, umaMovimentacao, umaParcela, umGasto } from '@/test/fabricas';

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
  '10/11/2026;Corrente;Conta fixa;Parcela do carro;Veículo;1.000,00;Pix;;7;;faltam 7',
  '10/03/2026;Corrente;Vale-refeição;;;5,00;;;;;',
].join('\r\n');

describe('lerPlanilhaDoCofre', () => {
  const { linhas, erros } = lerPlanilhaDoCofre(`﻿${planilha}`);

  it('reconhece o cabeçalho e lê cada linha, com aspas e ponto e vírgula dentro', () => {
    expect(ehPlanilhaDoCofre(planilha)).toBe(true);
    expect(ehPlanilhaDoCofre('data;descricao;valor')).toBe(false);
    expect(linhas).toHaveLength(13);
    expect(linhas[12]).toMatchObject({ tipo: 'conta_fixa', data: '2026-11-10', valor: 100000, formaPagamento: 'pix', parcela: { numero: 1, total: 7 } });
    expect(linhas[5]).toMatchObject({ tipo: 'saida', descricao: 'Padaria "Boa";Centro', valor: 1250, categoria: 'Alimentação' });
    expect(linhas[7]).toMatchObject({ tipo: 'compra_cartao', fatura: '2026-02', parcela: { numero: 2, total: 3 } });
  });

  it('diz o que está errado em cada linha', () => {
    expect(erros).toEqual([{ numero: 15, motivo: 'Tipo "Vale-refeição" não reconhecido' }]);
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
      { nome: 'Veículo', tipo: 'despesa' },
    ]);
    expect(plano.contasFixas).toEqual([{ nome: 'Parcela do carro', valor: 100000, dia: 10, vezes: 7 }]);
    expect(plano.comprasParceladas).toBe(1);
    expect(plano.totais).toEqual({ entradas: 240000, saidas: 1250, transferencias: 30000, comprasNoCartao: 9000, pagamentosDeFatura: 13500 });
    expect(plano.periodo).toEqual({ inicio: '2026-01-05', fim: '2026-03-10' });
  });

  it('cada linha vira o lançamento certo, e reimportar não duplica', () => {
    const ids = {
      contas: [umaConta({ id: 1, nomeConta: 'Corrente' }), umaConta({ id: 2, nomeConta: 'Poupança' })],
      cartoes: [umCartao({ id: 7, nome: 'Cartão X', diaFechamento: 1, diaVencimento: 10 })],
      categorias: [
        salario,
        umaCategoria({ id: 2, nome: 'Alimentação', tipo: 'despesa' }),
        umaCategoria({ id: 3, nome: 'Compras', tipo: 'despesa' }),
        umaCategoria({ id: 4, nome: 'Veículo', tipo: 'despesa' }),
      ],
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
    expect(registro.gastos.map((g) => [g.cartaoId, g.valor, g.data, g.descricao])).toEqual([[7, -1000, '2026-01-20', 'Estorno']]);
    // "Loja (2/3)" na fatura de fevereiro: compra em 3 vezes que começou em janeiro; a 1ª (antes da
    // planilha) e as de faturas pagas ficam pagas
    expect(registro.comprasParceladas).toEqual([
      {
        dados: { descricao: 'Loja', valorTotal: 30000, numParcelas: 3, cartaoId: 7, categoriaId: 3, dataCompra: '2026-01-15', membroId: null },
        mesPrimeiraParcela: '2026-01',
        valores: [10000, 10000, 10000],
        pagas: [
          { numero: 1, dataPagamento: '2026-01-10' },
          { numero: 2, dataPagamento: '2026-02-10' },
          { numero: 3, dataPagamento: '2026-03-10' },
        ],
      },
    ]);
    expect(registro.contasFixas).toEqual([
      {
        nome: 'Parcela do carro',
        categoriaId: 4,
        valor: 100000,
        diaVencimento: 10,
        formaPagamento: 'pix',
        contaBancariaId: 1,
        cartaoId: null,
        recorrencia: 'mensal',
        dataInicio: '2026-11-10',
        dataFim: '2027-05-10',
        membroId: null,
      },
    ]);
    expect(registro.pagamentosDeFatura.map((p) => [p.saida.contaBancariaId, p.saida.valor, p.saida.origem, p.pagamento.mesReferencia, p.pagamento.valorPago])).toEqual([
      [2, 6000, 'fatura', '2026-02', 9000],
      [1, 3000, 'fatura', '2026-02', 9000],
    ]);
    // a de março foi paga pela carteira; a de janeiro (parcela 1 da Loja, de antes da planilha) também
    expect(registro.faturasPagas).toEqual([
      expect.objectContaining({ cartaoId: 7, mesReferencia: '2026-03', valorPago: 4500, contaBancariaId: null, dataVencimento: '2026-03-10' }),
      expect.objectContaining({ cartaoId: 7, mesReferencia: '2026-01', valorPago: 10000, contaBancariaId: null, dataPagamento: '2026-01-10' }),
    ]);
    expect(registro.importacao).toMatchObject({ formato: 'csv', totalLinhas: 9, importadas: 13, ignoradas: 0 });

    const jaNoApp = new Set(
      [...registro.movimentacoes, ...registro.gastos, ...registro.pagamentosDeFatura.map((p) => p.saida)].map((l) => l.idExterno as string)
    );
    const deNovo = montarRegistroDaPlanilha(
      linhas,
      {
        ...ids,
        idsExternos: jaNoApp,
        comprasParceladas: [{ cartaoId: 7, descricao: 'Loja', numParcelas: 3, valorTotal: 30000 }],
        contasFixas: [{ nome: 'Parcela do carro', ativo: true }],
      },
      { arquivo: 'cofre.csv', criadaEm: '2026-10-21T10:00:00Z' }
    );
    expect(deNovo.movimentacoes).toHaveLength(0);
    expect(deNovo.gastos).toHaveLength(0);
    expect(deNovo.pagamentosDeFatura).toHaveLength(0);
    expect(deNovo.comprasParceladas).toHaveLength(0);
    expect(deNovo.contasFixas).toHaveLength(0);
    expect(deNovo.jaImportadas).toBe(9);
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

  it('conta fixa sai a partir da próxima em aberto, e a compra parcelada volta parcelada', () => {
    const corrente = umaConta({ id: 1, nomeConta: 'Corrente', banco: 'Banco Exemplo', saldoInicial: 0 });
    const cartao = umCartao({ id: 1, nome: 'Cartão X', diaFechamento: 1, diaVencimento: 10, limite: 50000 });
    const internet = umaContaFixa({ id: 9, nome: 'Internet', valor: 8100, diaVencimento: 10, formaPagamento: 'pix', contaBancariaId: 1, dataInicio: '2026-01-10', dataFim: null });
    const carro = umaContaFixa({ id: 10, nome: 'Carro', valor: 100000, diaVencimento: 10, formaPagamento: 'pix', contaBancariaId: 1, dataInicio: '2026-01-10', dataFim: '2027-05-10' });
    const tv = umaCompra({ id: 4, descricao: 'TV', cartaoId: 1, numParcelas: 2, valorTotal: 20000, dataCompra: '2026-01-15' });
    const csv = montarPlanilhaDoCofre({
      contas: [corrente],
      cartoes: [cartao],
      categorias: [],
      membros: [],
      movimentacoes: [],
      gastos: [],
      parcelas: [
        umaParcela({ id: 1, contaFixaId: 9, compraParceladaId: null, numero: 10, mesReferencia: '2026-10', status: 'paga' }),
        umaParcela({ id: 2, contaFixaId: 9, compraParceladaId: null, numero: 11, mesReferencia: '2026-11', status: 'pendente' }),
        umaParcela({ id: 3, contaFixaId: 10, compraParceladaId: null, numero: 11, mesReferencia: '2026-11', status: 'pendente' }),
        umaParcela({ id: 4, compraParceladaId: 4, contaFixaId: null, numero: 1, valor: 10000, mesReferencia: '2026-02', status: 'paga' }),
        umaParcela({ id: 5, compraParceladaId: 4, contaFixaId: null, numero: 2, valor: 10000, mesReferencia: '2026-03', status: 'pendente' }),
      ],
      comprasParceladas: [tv],
      contasFixas: [internet, carro],
      faturas: [],
    });
    const { linhas, erros } = lerPlanilhaDoCofre(csv);
    expect(erros).toEqual([]);
    const plano = planejarPlanilha(linhas, { contas: [], cartoes: [], categorias: [], membros: [] });
    expect(plano.contasFixas).toEqual([
      { nome: 'Internet', valor: 8100, dia: 10, vezes: null },
      { nome: 'Carro', valor: 100000, dia: 10, vezes: 7 },
    ]);
    expect(plano.comprasParceladas).toBe(1);
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

describe('entrada fixa e compra que já terminou', () => {
  const cabecalho = 'Data;Conta ou cartão;Tipo;Descrição;Categoria;Valor;Destino;Fatura;Parcela;Membro;Observação';
  const ids = {
    contas: [umaConta({ id: 1, nomeConta: 'Corrente' })],
    cartoes: [umCartao({ id: 7, nome: 'Cartão X', diaFechamento: 1, diaVencimento: 10 })],
    categorias: [umaCategoria({ id: 1, nome: 'Salário', tipo: 'receita' }), umaCategoria({ id: 2, nome: 'Compras', tipo: 'despesa' })],
    membros: [],
    idsExternos: new Set<string>(),
  };

  it('a entrada fixa é o modelo que o app repete todo mês', () => {
    const { linhas } = lerPlanilhaDoCofre([cabecalho, '09/10/2026;Corrente;Entrada fixa;Pix recebido;Salário;2.400,00;;;;;'].join('\n'));
    const registro = montarRegistroDaPlanilha(linhas, ids, { arquivo: 'x.csv', criadaEm: '2026-10-20' });
    expect(registro.movimentacoes).toEqual([expect.objectContaining({ tipo: 'entrada', valor: 240000, categoriaId: 1, recorrente: true })]);
  });

  it('parcelas que vieram com um mês pulado e já terminaram ficam como compras, cada uma na sua fatura', () => {
    const { linhas } = lerPlanilhaDoCofre(
      [
        cabecalho,
        '03/05/2026;Cartão X;Compra no cartão;LOJA (1/3);Compras;50,64;;2026-05;1/3;;',
        '03/05/2026;Cartão X;Compra no cartão;LOJA (2/3);Compras;50,64;;2026-07;2/3;;',
        '03/05/2026;Cartão X;Compra no cartão;LOJA (3/3);Compras;50,64;;2026-08;3/3;;',
        '10/05/2026;Corrente;Pagamento de fatura;x;;50,64;Cartão X;2026-05;;;',
        '10/07/2026;Corrente;Pagamento de fatura;x;;50,64;Cartão X;2026-07;;;',
        '10/08/2026;Corrente;Pagamento de fatura;x;;50,64;Cartão X;2026-08;;;',
      ].join('\n')
    );
    expect(planejarPlanilha(linhas, ids).comprasParceladas).toBe(0);
    const registro = montarRegistroDaPlanilha(linhas, ids, { arquivo: 'x.csv', criadaEm: '2026-10-20' });
    expect(registro.comprasParceladas).toEqual([]);
    expect(registro.gastos.map((g) => g.descricao)).toEqual(['LOJA (1/3)', 'LOJA (2/3)', 'LOJA (3/3)']);
  });
});

describe('casos da revisão', () => {
  const cabecalho = 'Data;Conta ou cartão;Tipo;Descrição;Categoria;Valor;Destino;Fatura;Parcela;Membro;Observação;Id';
  const cartaoX = umCartao({ id: 7, nome: 'Cartão X', diaFechamento: 1, diaVencimento: 10 });
  const ids = {
    contas: [umaConta({ id: 1, nomeConta: 'Corrente' })],
    cartoes: [cartaoX],
    categorias: [umaCategoria({ id: 1, nome: 'Salário', tipo: 'receita' }), umaCategoria({ id: 2, nome: 'Moradia', tipo: 'despesa' })],
    membros: [],
    idsExternos: new Set<string>(),
  };
  const ler = (...linhas: string[]) => lerPlanilhaDoCofre([cabecalho, ...linhas].join('\n')).linhas;
  const montar = (linhas: ReturnType<typeof ler>, extra: Partial<Parameters<typeof montarRegistroDaPlanilha>[1]> = {}) =>
    montarRegistroDaPlanilha(linhas, { ...ids, ...extra }, { arquivo: 'x.csv', criadaEm: '2026-10-20' });

  it('conta fixa no dia 31: o fim respeita o tamanho do mês e o dia fica 31', () => {
    const r = montar(ler('31/01/2026;Corrente;Conta fixa;Aluguel;Moradia;100,00;Pix;;2;;;'));
    expect(r.contasFixas?.[0]).toMatchObject({ diaVencimento: 31, dataInicio: '2026-01-31', dataFim: '2026-02-28' });
    // o dia que a data não mostra vem no Destino
    const r2 = montar(ler('30/11/2026;Corrente;Conta fixa;Aluguel;Moradia;100,00;Pix · dia 31;;;;;'));
    expect(r2.contasFixas?.[0]).toMatchObject({ diaVencimento: 31, recorrencia: 'mensal', dataFim: null });
  });

  it('conta fixa anual e única', () => {
    const r = montar(ler('10/03/2027;Corrente;Conta fixa;IPVA;Moradia;1.500,00;Boleto · anual;;2;;;', '10/12/2026;Corrente;Conta fixa;Seguro;Moradia;300,00;Boleto · única;;;;;'));
    expect(r.contasFixas?.map((c) => [c.nome, c.recorrencia, c.formaPagamento, c.dataFim])).toEqual([
      ['IPVA', 'anual', 'boleto', '2028-03-10'],
      ['Seguro', 'unica', 'boleto', null],
    ]);
  });

  it('planilha atualizada não duplica compra parcelada que já está no app (nem a que terminou)', () => {
    const linhas = ler(
      '15/01/2026;Cartão X;Compra no cartão;TV (1/2);Moradia;100,00;;2026-02;1/2;;;',
      '15/01/2026;Cartão X;Compra no cartão;TV (2/2);Moradia;100,00;;2026-03;2/2;;;',
      '10/02/2026;Corrente;Pagamento de fatura;x;;100,00;Cartão X;2026-02;;;;',
      '10/03/2026;Corrente;Pagamento de fatura;x;;100,00;Cartão X;2026-03;;;;'
    );
    const r = montar(linhas, { comprasParceladas: [{ cartaoId: 7, descricao: 'TV', numParcelas: 2, valorTotal: 20000 }] });
    expect(r.gastos).toEqual([]);
    expect(r.comprasParceladas).toEqual([]);
  });

  it('fatura paga reimportada: o valor pago é o de todos os pagamentos da planilha', () => {
    const linhas = ler('09/02/2026;Corrente;Pagamento de fatura;x;;100,00;Cartão X;2026-02;;;;', '10/02/2026;Cartão X;Fatura paga;;;50,00;;2026-02;;;;');
    const primeira = montar(linhas);
    expect(primeira.pagamentosDeFatura.map((p) => p.pagamento.valorPago)).toEqual([15000]);
    const jaNoApp = new Set(primeira.pagamentosDeFatura.map((p) => p.saida.idExterno as string));
    const faturas = [{ cartaoId: 7, mesReferencia: '2026-02', status: 'paga' as const, valorPago: 15000 }];
    const deNovo = montar(linhas, { idsExternos: jaNoApp, faturas });
    expect(deNovo.pagamentosDeFatura).toEqual([]);
    expect(deNovo.faturasPagas).toEqual([]);
    // um pagamento novo soma com o que já tinha
    const comNovo = montar([...linhas, ...ler('20/02/2026;Corrente;Pagamento de fatura;x;;30,00;Cartão X;2026-02;;;;')], { idsExternos: jaNoApp, faturas });
    expect(comNovo.pagamentosDeFatura.map((p) => [p.saida.valor, p.pagamento.valorPago])).toEqual([[3000, 18000]]);
  });

  it('várias "Entrada fixa" iguais: só a última é o modelo que se repete', () => {
    const r = montar(ler('09/09/2026;Corrente;Entrada fixa;Pix;Salário;2.400,00;;;;;;', '09/10/2026;Corrente;Entrada fixa;Pix;Salário;2.400,00;;;;;;'));
    expect(r.movimentacoes.map((m) => [m.data, m.recorrente ?? false])).toEqual([
      ['2026-09-09', false],
      ['2026-10-09', true],
    ]);
  });

  it('gasto em dinheiro não cria conta e não mexe em saldo', () => {
    const linhas = ler('05/10/2026;Dinheiro;Gasto em dinheiro;Feira;Moradia;20,00;;;;;;');
    expect(planejarPlanilha(linhas, { contas: [], cartoes: [], categorias: [], membros: [] }).contasNovas).toEqual([]);
    expect(montar(linhas).gastos).toEqual([expect.objectContaining({ formaPagamento: 'dinheiro', contaBancariaId: null, valor: 2000 })]);
  });

  it('campo entre aspas com quebra de linha e o Id de quem exportou', () => {
    const { linhas, erros } = lerPlanilhaDoCofre(`${cabecalho}\n05/10/2026;Corrente;Saída;"Linha 1\nLinha 2";Moradia;10,00;;;;;;app:mov:12\n`);
    expect(erros).toEqual([]);
    expect(linhas).toEqual([expect.objectContaining({ descricao: 'Linha 1\nLinha 2', valor: 1000, id: 'app:mov:12' })]);
    // exportada deste aparelho: a movimentação 12 já existe com o mesmo valor e data
    expect(montar(linhas, { movimentacoes: [{ id: 12, valor: 1000, data: '2026-10-05' }] }).movimentacoes).toEqual([]);
    expect(montar(linhas, { movimentacoes: [{ id: 12, valor: 999, data: '2026-10-05' }] }).movimentacoes).toHaveLength(1);
  });

  it('exportar: gasto em dinheiro, conta fixa no cartão e parcela paga sem fatura voltam certos', () => {
    const corrente = umaConta({ id: 1, nomeConta: 'Corrente', saldoInicial: 0 });
    const inativa = umaConta({ id: 2, nomeConta: 'Antiga', saldoInicial: 0, ativo: false });
    const streaming = umaContaFixa({ id: 5, nome: 'Streaming', valor: 2990, diaVencimento: 15, formaPagamento: 'cartao', cartaoId: 7, contaBancariaId: null, dataInicio: '2026-01-15' });
    const tv = umaCompra({ id: 4, descricao: 'TV', cartaoId: 7, numParcelas: 2, valorTotal: 20000, dataCompra: '2026-01-15' });
    const csv = montarPlanilhaDoCofre({
      contas: [corrente, inativa],
      cartoes: [cartaoX],
      categorias: [],
      membros: [],
      movimentacoes: [umaMovimentacao({ id: 3, contaBancariaId: 2, tipo: 'saida', valor: 500, data: '2026-01-05', descricao: 'Na conta antiga' })],
      gastos: [umGasto({ id: 1, valor: 2000, data: '2026-10-05', formaPagamento: 'dinheiro', contaBancariaId: 1, descricao: 'Feira' })],
      parcelas: [
        umaParcela({ id: 10, contaFixaId: 5, compraParceladaId: null, numero: 1, valor: 2990, mesReferencia: '2026-10', status: 'paga' }),
        umaParcela({ id: 11, contaFixaId: 5, compraParceladaId: null, numero: 2, valor: 2990, mesReferencia: '2026-11', status: 'pendente' }),
        umaParcela({ id: 12, compraParceladaId: 4, contaFixaId: null, numero: 1, valor: 10000, mesReferencia: '2026-02', status: 'paga', dataPagamento: '2026-02-10' }),
        umaParcela({ id: 13, compraParceladaId: 4, contaFixaId: null, numero: 2, valor: 10000, mesReferencia: '2026-03', status: 'pendente' }),
      ],
      comprasParceladas: [tv],
      contasFixas: [streaming],
      faturas: [],
    });
    const { linhas, erros } = lerPlanilhaDoCofre(csv);
    expect(erros).toEqual([]);
    const resumo = linhas.map((l) => [l.tipo, l.onde, l.valor, l.fatura]);
    expect(resumo).toContainEqual(['conta', 'Antiga', 0, null]);
    expect(resumo).toContainEqual(['saida', 'Antiga', 500, null]);
    expect(resumo).toContainEqual(['gasto_dinheiro', 'Dinheiro', 2000, null]);
    // a ocorrência paga da conta fixa no cartão (15/10, depois do fechamento) volta como compra na
    // fatura de novembro; a conta fixa volta a partir da ocorrência em aberto
    expect(resumo).toContainEqual(['compra_cartao', 'Cartão X', 2990, '2026-11']);
    expect(linhas.find((l) => l.tipo === 'conta_fixa')).toMatchObject({ data: '2026-11-15', formaPagamento: 'cartao', onde: 'Cartão X' });
    // a parcela 1 da TV estava paga sem a fatura registrada: a planilha diz que a fatura foi paga
    expect(resumo).toContainEqual(['fatura_paga', 'Cartão X', 10000, '2026-02']);
  });
});
