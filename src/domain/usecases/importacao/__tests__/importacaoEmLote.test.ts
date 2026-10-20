import { describe, expect, it } from '@jest/globals';
import {
  dividirPorMes,
  ordenarLote,
  planejarLote,
  prepararImportacaoAutomatica,
  type ArquivoDoLote,
  type BaseDaImportacao,
} from '@/domain/usecases/importacao/importacaoEmLote';
import type { ExtratoLido, TransacaoLida } from '@/domain/usecases/importacao/tipos';
import { umCartao, umaConta, umaMovimentacao } from '@/test/fabricas';

function transacao(dados: Partial<TransacaoLida>): TransacaoLida {
  return { data: '2026-10-10', descricao: 'X', valor: -1000, idExterno: `id-${Math.random()}`, parcela: null, linha: 1, ...dados };
}

function extrato(dados: Partial<ExtratoLido>): ExtratoLido {
  const transacoes = dados.transacoes ?? [transacao({})];
  const datas = transacoes.map((t) => t.data).sort();
  return {
    formato: 'pdf',
    banco: 'bb',
    origem: 'conta',
    transacoes,
    ignoradas: 0,
    periodo: { inicio: datas[0], fim: datas[datas.length - 1] },
    vencimentoFatura: null,
    ...dados,
  };
}

const arquivo = (chave: string, dados: Partial<ExtratoLido>): ArquivoDoLote => ({ chave, nome: `${chave}.pdf`, extrato: extrato(dados) });
const corrente = { agencia: '1234-5', numero: '5-0', tipo: 'corrente' as const };

describe('planejarLote', () => {
  const bbCorrente = umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'BB corrente', identificadorExtrato: null });
  const arquivos = [
    arquivo('out', { conta: corrente, transacoes: [transacao({ data: '2026-10-02' })], saldoAnterior: 50000 }),
    arquivo('set', { conta: corrente, transacoes: [transacao({ data: '2026-09-02' })] }),
    arquivo('poup-out', { conta: { agencia: null, numero: null, tipo: 'poupanca' }, transacoes: [transacao({ data: '2026-10-03' })], saldoAnterior: 9000 }),
    arquivo('poup-set', { conta: { agencia: null, numero: null, tipo: 'poupanca' }, transacoes: [transacao({ data: '2026-09-03' })], saldoAnterior: 1000 }),
    arquivo('outra-bb', { conta: { agencia: '1234-5', numero: '999-9', tipo: 'corrente' }, transacoes: [transacao({ data: '2026-10-04' })] }),
    arquivo('fatura-c6', {
      banco: 'c6',
      origem: 'cartao',
      vencimentoFatura: '2026-10-01',
      cartao: { nome: 'C6 Business', limite: 100000, diaFechamento: 24, diaVencimento: 1 },
      transacoes: [transacao({ data: '2026-09-05', valor: 2000 })],
    }),
  ];
  const plano = planejarLote(arquivos, [bbCorrente], [umCartao({ id: 7, nome: 'Ourocard' })]);

  it('liga os arquivos da mesma conta, separa poupança e outra conta do mesmo banco', () => {
    expect(plano.destinos).toEqual({
      out: { tipo: 'conta', contaBancariaId: 1 },
      set: { tipo: 'conta', contaBancariaId: 1 },
      'poup-out': { tipo: 'nova_conta', grupo: 'bb|poupanca' },
      'poup-set': { tipo: 'nova_conta', grupo: 'bb|poupanca' },
      'outra-bb': { tipo: 'nova_conta', grupo: 'bb|12345|9999|corrente' },
      'fatura-c6': { tipo: 'novo_cartao', grupo: 'c6|C6 BUSINESS' },
    });
  });

  it('conta nova começa com o saldo anterior do extrato mais antigo; cartão novo com os dias da fatura', () => {
    expect(plano.contasNovas).toEqual([
      { grupo: 'bb|poupanca', banco: 'Banco do Brasil', nomeConta: 'Banco do Brasil · Poupança', saldoInicial: 1000, identificadorExtrato: null },
      { grupo: 'bb|12345|9999|corrente', banco: 'Banco do Brasil', nomeConta: 'Banco do Brasil · Conta corrente 999', saldoInicial: 0, identificadorExtrato: 'bb|12345|9999|corrente' },
    ]);
    expect(plano.cartoesNovos).toEqual([{ grupo: 'c6|C6 BUSINESS', nome: 'C6 Business', limite: 100000, diaFechamento: 24, diaVencimento: 1 }]);
  });

  it('ordem: mês a mês, fatura antes da conta, corrente antes da poupança', () => {
    expect(ordenarLote(arquivos).map((a) => a.chave)).toEqual(['fatura-c6', 'set', 'poup-set', 'out', 'outra-bb', 'poup-out']);
  });
});

describe('dividirPorMes', () => {
  it('extrato de vários meses vira um pedaço por mês; o saldo anterior fica no primeiro', () => {
    const pedacos = dividirPorMes(
      arquivo('ano', {
        saldoAnterior: 700,
        ignoradas: 3,
        transacoes: [transacao({ data: '2026-09-30' }), transacao({ data: '2026-10-01' }), transacao({ data: '2026-10-20' })],
      })
    );
    expect(pedacos.map((p) => [p.chave, p.nome, p.extrato.transacoes.length, p.extrato.saldoAnterior, p.extrato.periodo])).toEqual([
      ['ano#2026-09', 'ano.pdf (09/2026)', 1, 700, { inicio: '2026-09-30', fim: '2026-09-30' }],
      ['ano#2026-10', 'ano.pdf (10/2026)', 2, null, { inicio: '2026-10-01', fim: '2026-10-20' }],
    ]);
    expect(dividirPorMes(arquivo('fatura', { origem: 'cartao', transacoes: [transacao({ data: '2026-09-01' }), transacao({ data: '2026-10-01' })] }))).toHaveLength(1);
  });
});

describe('prepararImportacaoAutomatica', () => {
  const contaCorrente = umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'BB corrente' });
  const poupanca = umaConta({ id: 2, banco: 'Banco do Brasil', nomeConta: 'BB Poupança' });
  const base = (movimentacoes: BaseDaImportacao['movimentacoes']): BaseDaImportacao => ({
    categorias: [],
    regras: [],
    contatos: [],
    contas: [contaCorrente, poupanca],
    cartoes: [],
    contasFixas: [],
    parcelas: [],
    compras: [],
    gastos: [],
    faturas: [],
    movimentacoes,
    importacoes: [],
    nomesProprios: ['MARIA S OLIVEIRA'],
  });
  const agora = new Date(Date.UTC(2026, 9, 20));

  it('a transferência corrente ↔ poupança entra uma vez só', () => {
    const daCorrente = prepararImportacaoAutomatica({
      arquivo: 'corrente.pdf',
      extrato: extrato({ transacoes: [transacao({ idExterno: 'c1', data: '2026-10-09', valor: 8000, descricao: 'Transferido da poupança 09/10 MARIA S OLIVEIRA' })] }),
      destino: { tipo: 'conta', contaBancariaId: 1 },
      base: base([]),
      agora,
    });
    expect(daCorrente.registro.movimentacoes).toHaveLength(1);
    const transferencia = daCorrente.registro.movimentacoes[0];
    expect(transferencia).toMatchObject({ tipo: 'transferencia', contaBancariaId: 2, contaDestinoId: 1, valor: 8000 });
    expect(daCorrente.registro.perguntas).toEqual([]);

    // depois, o extrato da poupança traz o outro lado com outro texto
    const daPoupanca = prepararImportacaoAutomatica({
      arquivo: 'poupanca.pdf',
      extrato: extrato({
        conta: { agencia: null, numero: null, tipo: 'poupanca' },
        transacoes: [
          transacao({ idExterno: 'p1', data: '2026-10-09', valor: -8000, descricao: 'Transferência para conta corrente' }),
          transacao({ idExterno: 'p2', data: '2026-10-10', valor: 35, descricao: 'Rendimento poupança' }),
        ],
      }),
      destino: { tipo: 'conta', contaBancariaId: 2 },
      base: base([umaMovimentacao({ ...transferencia, id: 900 })]),
      agora,
    });
    expect(daPoupanca.registro.movimentacoes.map((m) => [m.idExterno, m.tipo, m.valor])).toEqual([['p2', 'entrada', 35]]);
  });
});

describe('poupança importada depois da corrente', () => {
  const contaCorrente = umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'BB corrente' });
  const poupanca = umaConta({ id: 2, banco: 'Banco do Brasil', nomeConta: 'BB Poupança' });
  const base = (movimentacoes: BaseDaImportacao['movimentacoes'], contas = [contaCorrente, poupanca]): BaseDaImportacao => ({
    categorias: [],
    regras: [],
    contatos: [],
    contas,
    cartoes: [],
    contasFixas: [],
    parcelas: [],
    compras: [],
    gastos: [],
    faturas: [],
    movimentacoes,
    importacoes: [],
    nomesProprios: ['MARIA S OLIVEIRA'],
  });
  const agora = new Date(Date.UTC(2026, 9, 20));

  it('a corrente lança na segunda o que saiu da poupança na sexta: entra uma vez só', () => {
    // a corrente foi importada antes de existir a poupança no app: ficou entrada interna
    const daPoupancaNaCorrente = umaMovimentacao({
      id: 500,
      contaBancariaId: 1,
      tipo: 'entrada',
      origem: 'interna',
      valor: 39798,
      data: '2026-10-13',
      descricao: 'Transferido da poupança 10/10 00:37 MARIA S OLIVEIRA',
    });
    const r = prepararImportacaoAutomatica({
      arquivo: 'poupanca.pdf',
      extrato: extrato({
        conta: { agencia: null, numero: null, tipo: 'poupanca' },
        transacoes: [transacao({ idExterno: 'p1', data: '2026-10-10', valor: -39798, descricao: 'Transferido para conta corrente' })],
      }),
      destino: { tipo: 'conta', contaBancariaId: 2 },
      base: base([daPoupancaNaCorrente]),
      agora,
    });
    expect(r.registro.movimentacoes).toEqual([]);
    expect(r.registro.alteracoes).toEqual([
      expect.objectContaining({ movimentacaoId: 500, mudancas: expect.objectContaining({ tipo: 'transferencia', contaBancariaId: 2, contaDestinoId: 1 }) }),
    ]);
  });

  it('com a poupança já no app quando a corrente entrou: o lado da poupança é reconhecido como já lançado', () => {
    const transferencia = umaMovimentacao({ id: 501, contaBancariaId: 2, contaDestinoId: 1, tipo: 'transferencia', valor: 39798, data: '2026-10-13', descricao: 'Transferido da poupança' });
    const r = prepararImportacaoAutomatica({
      arquivo: 'poupanca.pdf',
      extrato: extrato({ transacoes: [transacao({ idExterno: 'p2', data: '2026-10-10', valor: -39798, descricao: 'Transferido para conta corrente' })] }),
      destino: { tipo: 'conta', contaBancariaId: 2 },
      base: base([transferencia]),
      agora,
    });
    expect(r.registro.movimentacoes).toEqual([]);
    expect(r.registro.alteracoes).toEqual([]);
  });
});
