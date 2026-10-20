import { describe, expect, it } from '@jest/globals';
import {
  analisarImportacao,
  dataNaFatura,
  existentesDoDestino,
  montarRegistroDeImportacao,
  sugerirDestino,
  sugerirMesDaFatura,
} from '@/domain/usecases/importacao/analisarImportacao';
import type { ExtratoLido, TransacaoLida } from '@/domain/usecases/importacao/tipos';
import { umaConta, umaMovimentacao, umCartao, umGasto } from '@/test/fabricas';

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
    expect(resumo).toEqual({ total: 4, novas: 1, jaImportadas: 1, duplicatas: 0, duvidas: 1, pagamentosOuEstornos: 1 });
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
      selecionadas: [extrato.transacoes[0]],
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
    expect(registro.gastos.map((g) => [g.valor, g.idExterno, g.cartaoId])).toEqual([[5000, 'a', 2]]);
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
      selecionadas: extrato.transacoes,
      agora: new Date(),
      fatura: { mes: '2026-11', cartao: c6 },
    });
    expect(registro.gastos.map((g) => [g.data, g.descricao, g.idExterno])).toEqual([
      ['2026-10-05', 'PADARIA', 'a'],
      ['2026-11-02', 'LOJA (compra em 09/06/2024)', 'c'],
    ]);
  });
});
