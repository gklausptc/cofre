import { describe, expect, it } from '@jest/globals';
import {
  analisarImportacao,
  dataNaFatura,
  existentesDoDestino,
  linhaDoItem,
  montarRegistroDeImportacao,
  sugerirDestino,
  sugerirMesDaFatura,
} from '@/domain/usecases/importacao/analisarImportacao';
import { prepararCategorizador } from '@/domain/usecases/importacao/categorizar';
import type { ExtratoLido, TransacaoLida } from '@/domain/usecases/importacao/tipos';
import {
  umaCategoria,
  umaConta,
  umaContaFixa,
  umaMovimentacao,
  umaParcela,
  umaRegra,
  umCartao,
  umGasto,
} from '@/test/fabricas';

function transacao(dados: Partial<TransacaoLida>): TransacaoLida {
  return { data: '2026-10-10', descricao: 'X', valor: -1000, idExterno: 'x', parcela: null, linha: 1, ...dados };
}

function extratoCom(transacoes: TransacaoLida[], dados: Partial<ExtratoLido> = {}): ExtratoLido {
  return { formato: 'csv', banco: 'c6', origem: 'cartao', transacoes, ignoradas: 1, periodo: { inicio: '2026-10-01', fim: '2026-10-31' }, vencimentoFatura: null, ...dados };
}

describe('existentesDoDestino', () => {
  it('conta: movimentações com sinal (saída e transferência enviada negativas) e débitos/pix da conta', () => {
    const existentes = existentesDoDestino(
      { tipo: 'conta', contaBancariaId: 1 },
      [
        umaMovimentacao({ id: 1, contaBancariaId: 1, tipo: 'saida', valor: 500 }),
        umaMovimentacao({ id: 2, contaBancariaId: 1, tipo: 'entrada', valor: 900 }),
        umaMovimentacao({ id: 3, contaBancariaId: 2, tipo: 'transferencia', valor: 300, contaDestinoId: 1 }),
        umaMovimentacao({ id: 4, contaBancariaId: 9, tipo: 'saida', valor: 1 }),
      ],
      [umGasto({ id: 7, formaPagamento: 'pix', contaBancariaId: 1, valor: 40 }), umGasto({ id: 8, formaPagamento: 'dinheiro', valor: 5 })]
    );
    expect(existentes.map((e) => [e.id, e.valor])).toEqual([
      ['mov-1', -500],
      ['mov-2', 900],
      ['mov-3', 300],
      ['gasto-7', -40],
    ]);
  });

  it('cartão: compras daquele cartão, positivas', () => {
    const existentes = existentesDoDestino(
      { tipo: 'cartao', cartaoId: 2 },
      [],
      [umGasto({ id: 1, formaPagamento: 'cartao', cartaoId: 2, valor: 100, idExterno: 'abc' }), umGasto({ id: 2, formaPagamento: 'cartao', cartaoId: 3, valor: 1 })]
    );
    expect(existentes).toEqual([{ id: 'gasto-1', data: '2026-01-01', valor: 100, descricao: '', idExterno: 'abc' }]);
  });
});

describe('analisarImportacao', () => {
  const extrato = extratoCom([
    transacao({ idExterno: 'a', valor: 5000, descricao: 'LOJA NOVA' }),
    transacao({ idExterno: 'b', valor: 2000, descricao: 'JA VEIO' }),
    transacao({ idExterno: 'c', valor: -100000, descricao: 'PAGAMENTO RECEBIDO' }),
    transacao({ idExterno: 'd', valor: 4590, descricao: 'PADARIA SAO JOSE' }),
  ]);
  const existentes = [
    { id: 'gasto-1', data: '2026-10-10', valor: 2000, descricao: 'JA VEIO', idExterno: 'b' },
    { id: 'gasto-2', data: '2026-10-09', valor: 4590, descricao: 'Padaria', idExterno: null },
  ];
  const { itens, resumo } = analisarImportacao(extrato, { tipo: 'cartao', cartaoId: 2 }, existentes);

  it('diz o que fazer com cada linha', () => {
    expect(itens.map((i) => [i.situacao.tipo, i.pagamentoOuEstorno, i.incluirPorPadrao, i.podeIncluir])).toEqual([
      ['nova', false, true, true],
      ['ja_importada', false, false, false],
      ['nova', true, false, false],
      ['duvida', false, false, true],
    ]);
  });

  it('resume a análise', () => {
    expect(resumo).toMatchObject({ total: 4, novas: 1, jaImportadas: 1, duplicatas: 0, duvidas: 1, pagamentosOuEstornos: 1 });
  });
});

describe('sugerirDestino', () => {
  const contas = [umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'Corrente' }), umaConta({ id: 2, banco: 'C6 Bank', nomeConta: 'Conta' })];
  const cartoes = [umCartao({ id: 5, nome: 'C6 Carbon' }), umCartao({ id: 6, nome: 'PicPay Card' })];

  it('pelo banco do arquivo', () => {
    expect(sugerirDestino({ banco: 'bb', origem: 'conta' }, contas, cartoes)).toEqual({ tipo: 'conta', id: 1 });
    expect(sugerirDestino({ banco: 'picpay', origem: 'cartao' }, contas, cartoes)).toEqual({ tipo: 'cartao', id: 6 });
  });

  it('sem banco reconhecido: só sugere se houver um único', () => {
    expect(sugerirDestino({ banco: null, origem: 'conta' }, contas, cartoes)).toEqual({ tipo: 'conta', id: null });
    expect(sugerirDestino({ banco: null, origem: null }, [contas[0]], cartoes)).toEqual({ tipo: 'conta', id: 1 });
  });
});

describe('montarRegistroDeImportacao', () => {
  it('a importação leva os números e as linhas levam o id externo', () => {
    const extrato = extratoCom([transacao({ idExterno: 'a', valor: 5000 }), transacao({ idExterno: 'b', valor: 2000 })]);
    const registro = montarRegistroDeImportacao({
      arquivo: 'fatura.csv',
      extrato,
      destino: { tipo: 'cartao', cartaoId: 2 },
      linhas: [{ transacao: extrato.transacoes[0], categoriaId: 3 }],
      agora: new Date(Date.UTC(2026, 9, 20, 12)),
    });

    expect(registro.importacao).toEqual({
      arquivo: 'fatura.csv',
      formato: 'csv',
      banco: 'c6',
      contaBancariaId: null,
      cartaoId: 2,
      periodoInicio: '2026-10-01',
      periodoFim: '2026-10-31',
      totalLinhas: 3,
      importadas: 1,
      ignoradas: 2,
      pendentes: 0,
      criadaEm: '2026-10-20T12:00:00.000Z',
    });
    expect(registro.gastos.map((g) => [g.valor, g.idExterno, g.cartaoId, g.categoriaId])).toEqual([[5000, 'a', 2, 3]]);
    expect(registro.movimentacoes).toEqual([]);
  });
});

describe('fatura de cartão: em que fatura cada compra entra', () => {
  // C6 fechando dia 2 e vencendo dia 10
  const c6 = { id: 2, diaFechamento: 2, diaVencimento: 10 };

  it('o vencimento que o arquivo informa vale', () => {
    expect(sugerirMesDaFatura({ transacoes: [], vencimentoFatura: '2026-11-10' }, c6)).toBe('2026-11');
  });

  it('sem vencimento no arquivo: o mês da maioria das compras à vista, ignorando parcelas antigas', () => {
    const extrato = {
      vencimentoFatura: null,
      transacoes: [
        transacao({ idExterno: 'a', data: '2026-10-05', valor: 2590 }),
        transacao({ idExterno: 'b', data: '2026-10-20', valor: 1000 }),
        transacao({ idExterno: 'c', data: '2024-06-09', valor: 19590, parcela: { numero: 9, total: 10 } }),
        transacao({ idExterno: 'd', data: '2026-10-25', valor: -150000 }),
      ],
    };
    expect(sugerirMesDaFatura(extrato, c6)).toBe('2026-11');
  });

  it('compra antiga (parcela 9/10) entra na data de fechamento da fatura escolhida', () => {
    expect(dataNaFatura('2024-06-09', '2026-11', c6)).toEqual({ data: '2026-11-02', ajustada: true });
    expect(dataNaFatura('2026-10-05', '2026-11', c6)).toEqual({ data: '2026-10-05', ajustada: false });
  });

  it('ao gravar, a parcela antiga ganha a data da fatura e a data original na descrição', () => {
    const extrato = extratoCom([
      transacao({ idExterno: 'a', data: '2026-10-05', valor: 2590, descricao: 'PADARIA' }),
      transacao({ idExterno: 'c', data: '2024-06-09', valor: 19590, descricao: 'LOJA', parcela: { numero: 9, total: 10 } }),
    ]);
    const registro = montarRegistroDeImportacao({
      arquivo: 'Fatura_2026-11-10.csv',
      extrato,
      destino: { tipo: 'cartao', cartaoId: 2 },
      linhas: extrato.transacoes.map((transacao) => ({ transacao, categoriaId: null })),
      agora: new Date(),
      fatura: { mes: '2026-11', cartao: c6 },
    });
    expect(registro.gastos.map((g) => [g.data, g.descricao, g.idExterno])).toEqual([
      ['2026-10-05', 'PADARIA', 'a'],
      ['2026-11-02', 'LOJA (compra em 09/06/2024)', 'c'],
    ]);
  });
});

describe('análise completa (categorização + conciliação) e o que gravar', () => {
  const categorias = [
    umaCategoria({ id: 1, nome: 'Alimentação' }),
    umaCategoria({ id: 3, nome: 'Moradia' }),
    umaCategoria({ id: 8, nome: 'Assinaturas' }),
    umaCategoria({ id: 10, nome: 'Salário', tipo: 'receita' }),
  ];
  const bb = umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'BB' });
  const c6 = umaConta({ id: 2, banco: 'C6 Bank', nomeConta: 'C6' });
  const cartao = umCartao({ id: 10, nome: 'C6 Carbon', diaFechamento: 3, diaVencimento: 10 });
  const luz = umaContaFixa({ id: 30, nome: 'Conta de luz', valor: 18240, diaVencimento: 12, contaBancariaId: 1, categoriaId: 3 });
  const ocorrencia = umaParcela({ id: 300, contaFixaId: 30, valor: 18240, mesReferencia: '2026-10' });
  const gastoNoCartao = umGasto({ valor: 50000, data: '2026-09-20', formaPagamento: 'cartao', cartaoId: 10 });
  const entradaNoC6 = umaMovimentacao({
    id: 700,
    contaBancariaId: 2,
    tipo: 'entrada',
    valor: 20000,
    data: '2026-10-15',
    descricao: 'PIX RECEBIDO GREGORY KLAUS',
  });

  const dados = {
    contas: [bb, c6],
    cartoes: [cartao],
    contasFixas: [luz],
    parcelas: [ocorrencia],
    compras: [],
    gastos: [gastoNoCartao],
    faturas: [],
    movimentacoes: [entradaNoC6],
  };
  const extrato = extratoCom(
    [
      transacao({ idExterno: 'luz', data: '2026-10-12', valor: -18990, descricao: 'DEB AUTOMATICO CONTA DE LUZ' }),
      transacao({ idExterno: 'fatura', data: '2026-10-09', valor: -50000, descricao: 'PAGTO FATURA C6' }),
      transacao({ idExterno: 'transf', data: '2026-10-15', valor: -20000, descricao: 'PIX ENVIADO GREGORY KLAUS' }),
      transacao({ idExterno: 'netflix', data: '2026-10-16', valor: -5590, descricao: 'NETFLIX.COM' }),
      transacao({ idExterno: 'salario', data: '2026-10-05', valor: 500000, descricao: 'CRED SALARIO ACME' }),
      transacao({ idExterno: 'misterio', data: '2026-10-20', valor: -3000, descricao: 'XPTO 123 COMERCIAL' }),
    ],
    { banco: 'bb', origem: 'conta' }
  );
  const destino = { tipo: 'conta' as const, contaBancariaId: 1 };
  const inteligencia = {
    categorizar: prepararCategorizador({ categorias, regras: [], contatos: [], historico: [] }),
    dados,
    categorias,
  };
  const existentes = existentesDoDestino(destino, dados.movimentacoes, dados.gastos);
  const { itens, resumo } = analisarImportacao(extrato, destino, existentes, inteligencia);

  it('reconhece cada linha', () => {
    expect(itens.map((i) => [i.transacao.idExterno, i.conciliacao?.tipo ?? null, i.categoriaSugerida, i.precisaDeVoce])).toEqual([
      ['luz', 'conta_fixa', 3, false],
      ['fatura', 'fatura', null, false],
      ['transf', 'transferencia_propria', null, false],
      ['netflix', null, 8, false],
      ['salario', 'salario', 10, false],
      ['misterio', null, null, true],
    ]);
    expect(resumo).toMatchObject({
      categorizadosSozinhos: 5,
      contasFixas: 1,
      pagamentosDeFatura: 1,
      transferencias: 1,
      precisamDeVoce: 1,
    });
  });

  it('monta o que gravar: baixa na conta fixa e na fatura, transferência no outro lado', () => {
    const registro = montarRegistroDeImportacao({
      arquivo: 'extrato.csv',
      extrato,
      destino,
      linhas: itens.filter((i) => i.incluirPorPadrao).map((i) => linhaDoItem(i)),
      agora: new Date(Date.UTC(2026, 9, 20)),
    });
    expect(registro.pagamentosDeContaFixa).toEqual([{ parcelaId: 300, dataPagamento: '2026-10-12', valor: 18990 }]);
    expect(registro.pagamentosDeFatura).toHaveLength(1);
    expect(registro.pagamentosDeFatura[0].pagamento).toMatchObject({
      cartaoId: 10,
      mesReferencia: '2026-10',
      valorPago: 50000,
      contaBancariaId: 1,
    });
    expect(registro.pagamentosDeFatura[0].saida).toMatchObject({ origem: 'fatura', idExterno: 'fatura', tipo: 'saida' });
    expect(registro.alteracoes).toEqual([
      {
        movimentacaoId: 700,
        motivo: 'transferencia',
        mudancas: { tipo: 'transferencia', contaBancariaId: 1, contaDestinoId: 2, categoriaId: null },
      },
    ]);
    expect(registro.movimentacoes.map((m) => [m.idExterno, m.tipo, m.origem, m.categoriaId, m.parcelaId])).toEqual([
      ['luz', 'saida', 'conta_fixa', 3, 300],
      ['netflix', 'saida', 'manual', 8, null],
      ['salario', 'entrada', 'manual', 10, null],
      ['misterio', 'saida', 'manual', null, null],
    ]);
    expect(registro.importacao.importadas).toBe(6);
  });

  it('transferência sem o outro lado vira transferência sem destino; receita prevista é confirmada', () => {
    const prevista = umaMovimentacao({
      id: 800,
      contaBancariaId: 1,
      tipo: 'entrada',
      valor: 490000,
      data: '2026-10-05',
      recorrenteOrigemId: 1,
    });
    const outro = extratoCom(
      [
        transacao({ idExterno: 'apl', valor: -100000, descricao: 'APLICACAO CDB' }),
        transacao({ idExterno: 'sal', data: '2026-10-06', valor: 500000, descricao: 'CRED SALARIO ACME' }),
      ],
      { banco: 'bb', origem: 'conta' }
    );
    const analise = analisarImportacao(outro, destino, [], { ...inteligencia, dados: { ...dados, movimentacoes: [prevista] } });
    const registro = montarRegistroDeImportacao({
      arquivo: 'x.csv',
      extrato: outro,
      destino,
      linhas: analise.itens.map((i) => linhaDoItem(i)),
      agora: new Date(),
    });
    expect(registro.movimentacoes.map((m) => [m.tipo, m.contaDestinoId, m.categoriaId])).toEqual([['transferencia', null, null]]);
    expect(registro.alteracoes).toEqual([
      { movimentacaoId: 800, motivo: 'receita_prevista', mudancas: { valor: 500000, data: '2026-10-06', idExterno: 'sal' } },
    ]);
  });

  it('regra que manda ignorar desmarca a linha e conta o uso das regras', () => {
    const regras = [
      umaRegra({ id: 61, padrao: 'XPTO 123 COMERCIAL', acao: 'ignorar' }),
      umaRegra({ id: 62, padrao: 'NETFLIX', categoriaId: 8 }),
    ];
    const comRegras = { ...inteligencia, categorizar: prepararCategorizador({ categorias, regras, contatos: [], historico: [] }) };
    const analise = analisarImportacao(extrato, destino, [], comRegras);
    const misterio = analise.itens.find((i) => i.transacao.idExterno === 'misterio');
    expect(misterio).toMatchObject({ incluirPorPadrao: false, precisaDeVoce: false });
    const registro = montarRegistroDeImportacao({
      arquivo: 'x.csv',
      extrato,
      destino,
      linhas: analise.itens.filter((i) => i.incluirPorPadrao).map((i) => linhaDoItem(i)),
      agora: new Date(),
    });
    expect(registro.regrasUsadas).toEqual([62]);
  });
});
