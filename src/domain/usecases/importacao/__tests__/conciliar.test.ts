import { describe, expect, it } from '@jest/globals';
import { conciliarExtrato, type DadosParaConciliar } from '@/domain/usecases/importacao/conciliar';
import type { Categorizacao } from '@/domain/usecases/importacao/categorizar';
import type { TransacaoLida } from '@/domain/usecases/importacao/tipos';
import {
  umCartao,
  umGasto,
  umaCompra,
  umaConta,
  umaContaFixa,
  umaFatura,
  umaMovimentacao,
  umaParcela,
} from '@/test/fabricas';

function linha(dados: Partial<TransacaoLida>): TransacaoLida {
  return { data: '2026-10-10', descricao: 'X', valor: -1000, idExterno: 'x', parcela: null, linha: 1, ...dados };
}

const bb = umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'BB corrente' });
const c6 = umaConta({ id: 2, banco: 'C6 Bank', nomeConta: 'C6 conta' });
const cartaoC6 = umCartao({ id: 10, nome: 'C6 Carbon', diaFechamento: 3, diaVencimento: 10 });

function dados(extra: Partial<DadosParaConciliar> = {}): DadosParaConciliar {
  return {
    contas: [bb, c6],
    cartoes: [cartaoC6],
    contasFixas: [],
    parcelas: [],
    compras: [],
    gastos: [],
    faturas: [],
    movimentacoes: [],
    ...extra,
  };
}

const naContaBB = { tipo: 'conta' as const, contaBancariaId: 1 };
const semCategoria = (n: number) => Array.from({ length: n }, () => null);

describe('contas fixas', () => {
  const luz = umaContaFixa({ id: 30, nome: 'Conta de luz', valor: 18240, diaVencimento: 12, contaBancariaId: 1, categoriaId: 3 });
  const ocorrencia = umaParcela({ id: 300, contaFixaId: 30, valor: 18240, mesReferencia: '2026-10' });

  it('valor igual e data perto: dá baixa na ocorrência', () => {
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-11', valor: -18240, descricao: 'DEBITO AUTOMATICO ENEL' })],
      semCategoria(1),
      naContaBB,
      dados({ contasFixas: [luz], parcelas: [ocorrencia] })
    );
    expect(r).toMatchObject({ tipo: 'conta_fixa', parcelaId: 300, contaFixaId: 30, categoriaId: 3 });
  });

  it('valor até 5% diferente só casa com nome parecido ou mesma categoria', () => {
    const t = [linha({ data: '2026-10-12', valor: -18990, descricao: 'PAGAMENTO CONTA DE LUZ' })];
    expect(conciliarExtrato(t, semCategoria(1), naContaBB, dados({ contasFixas: [luz], parcelas: [ocorrencia] }))[0]?.tipo).toBe(
      'conta_fixa'
    );
    const outra = [linha({ data: '2026-10-12', valor: -18990, descricao: 'LOJA QUALQUER' })];
    expect(conciliarExtrato(outra, semCategoria(1), naContaBB, dados({ contasFixas: [luz], parcelas: [ocorrencia] }))[0]).toBeNull();
  });

  it('fora de ±5 dias ou de ±5% não casa', () => {
    const longe = [linha({ data: '2026-10-25', valor: -18240, descricao: 'CONTA DE LUZ' })];
    expect(conciliarExtrato(longe, semCategoria(1), naContaBB, dados({ contasFixas: [luz], parcelas: [ocorrencia] }))[0]).toBeNull();
    const caro = [linha({ data: '2026-10-12', valor: -25000, descricao: 'CONTA DE LUZ' })];
    expect(conciliarExtrato(caro, semCategoria(1), naContaBB, dados({ contasFixas: [luz], parcelas: [ocorrencia] }))[0]).toBeNull();
  });

  it('ocorrência já paga não casa de novo; a saída do app vira "já paga"', () => {
    const paga = { ...ocorrencia, status: 'paga' as const, dataPagamento: '2026-10-12' };
    const saidaDoApp = umaMovimentacao({ id: 900, contaBancariaId: 1, valor: 18240, data: '2026-10-12', parcelaId: 300, origem: 'conta_fixa', descricao: 'Conta de luz' });
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-11', valor: -18240, descricao: 'ENEL' })],
      semCategoria(1),
      naContaBB,
      dados({ contasFixas: [luz], parcelas: [paga], movimentacoes: [saidaDoApp] })
    );
    expect(r).toMatchObject({ tipo: 'ja_paga', existenteId: 'mov-900' });
  });

  it('uma ocorrência casa com uma linha só', () => {
    const t = [
      linha({ data: '2026-10-11', valor: -18240, descricao: 'CONTA DE LUZ' }),
      linha({ data: '2026-10-12', valor: -18240, descricao: 'CONTA DE LUZ' }),
    ];
    const r = conciliarExtrato(t, semCategoria(2), naContaBB, dados({ contasFixas: [luz], parcelas: [ocorrencia] }));
    expect(r.map((c) => c?.tipo ?? null)).toEqual(['conta_fixa', null]);
  });
});

describe('pagamento de fatura', () => {
  // compra de R$ 500 em 20/09 cai na fatura que fecha 03/10 e vence 10/10
  const gasto = umGasto({ valor: 50000, data: '2026-09-20', formaPagamento: 'cartao', cartaoId: 10 });

  it('valor igual ao da fatura: liga à fatura', () => {
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-09', valor: -50000, descricao: 'PIX ENVIADO - BANCO C6' })],
      semCategoria(1),
      naContaBB,
      dados({ gastos: [gasto] })
    );
    expect(r).toMatchObject({ tipo: 'fatura', fatura: { cartaoId: 10, mesReferencia: '2026-10', dataVencimento: '2026-10-10' } });
  });

  it('texto de fatura com valor diferente: liga e avisa a diferença', () => {
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-10', valor: -61234, descricao: 'PAGTO FATURA CARTAO C6' })],
      semCategoria(1),
      naContaBB,
      dados({ gastos: [gasto] })
    );
    expect(r?.tipo).toBe('fatura');
    expect(r?.motivo).toContain('R$');
  });

  it('texto de fatura sem cartão no app: continua sendo pagamento (não despesa)', () => {
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-10', valor: -30000, descricao: 'PAGAMENTO DE FATURA NUBANK' })],
      semCategoria(1),
      naContaBB,
      dados({ cartoes: [] })
    );
    expect(r).toMatchObject({ tipo: 'fatura', fatura: null });
  });

  it('fatura já paga não casa', () => {
    const paga = umaFatura({ cartaoId: 10, mesReferencia: '2026-10', status: 'paga' });
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-09', valor: -50000, descricao: 'PIX ENVIADO' })],
      semCategoria(1),
      naContaBB,
      dados({ gastos: [gasto], faturas: [paga] })
    );
    expect(r).toBeNull();
  });
});

describe('transferência entre contas suas', () => {
  it('o outro lado já importado na outra conta vira a contraparte', () => {
    const entradaNoC6 = umaMovimentacao({ id: 700, contaBancariaId: 2, tipo: 'entrada', valor: 20000, data: '2026-10-10', descricao: 'PIX RECEBIDO GREGORY KLAUS' });
    const [r] = conciliarExtrato(
      [linha({ valor: -20000, descricao: 'PIX ENVIADO - GREGORY KLAUS' })],
      semCategoria(1),
      naContaBB,
      dados({ movimentacoes: [entradaNoC6] })
    );
    expect(r).toMatchObject({ tipo: 'transferencia_propria', outraContaId: 2, contraparteId: 700 });
  });

  it('mesmo valor no mesmo dia para pessoas diferentes é coincidência', () => {
    const entradaNoC6 = umaMovimentacao({ contaBancariaId: 2, tipo: 'entrada', valor: 20000, data: '2026-10-10', descricao: 'PIX RECEBIDO MARIA SOUZA' });
    const [r] = conciliarExtrato(
      [linha({ valor: -20000, descricao: 'PIX ENVIADO - JOAO PEREIRA' })],
      semCategoria(1),
      naContaBB,
      dados({ movimentacoes: [entradaNoC6] })
    );
    expect(r).toBeNull();
  });

  it('entrada casa com transferência sem destino que veio da outra conta', () => {
    const transferencia = umaMovimentacao({ id: 701, contaBancariaId: 2, tipo: 'transferencia', contaDestinoId: null, valor: 5000, data: '2026-10-10', descricao: 'TRANSF ENVIADA' });
    const [r] = conciliarExtrato(
      [linha({ valor: 5000, descricao: 'TED RECEBIDA' })],
      semCategoria(1),
      naContaBB,
      dados({ movimentacoes: [transferencia] })
    );
    expect(r).toMatchObject({ tipo: 'transferencia_propria', contraparteId: 701 });
  });

  it('regra ou contato de conta própria, e texto de mesma titularidade', () => {
    const propria: Categorizacao = {
      categoriaId: null,
      membroId: null,
      confianca: 1,
      camada: 'contato',
      motivo: 'Contato PIX: Eu',
      acao: 'transferencia_propria',
      regraId: null,
      contatoPixId: 1,
      contaFixaId: null,
      comerciante: null,
      assinatura: false,
      pessoaPix: 'GREGORY KLAUS',
    };
    const r = conciliarExtrato(
      [
        linha({ valor: -10000, descricao: 'PIX ENVIADO GREGORY KLAUS C6' }),
        linha({ valor: -10000, descricao: 'TRANSF MESMA TITULARIDADE', data: '2026-10-20' }),
        linha({ valor: -10000, descricao: 'APLICACAO CDB', data: '2026-10-21' }),
      ],
      [propria, null, null],
      naContaBB,
      dados()
    );
    expect(r[0]).toMatchObject({ tipo: 'transferencia_propria', outraContaId: 2, contraparteId: null });
    expect(r[1]).toMatchObject({ tipo: 'transferencia_propria', contraparteId: null });
    expect(r[2]).toMatchObject({ tipo: 'transferencia_propria', outraContaId: null, motivo: 'Aplicação no próprio banco' });
  });
});

describe('entradas', () => {
  it('confirma a receita recorrente que o app já lançou', () => {
    const prevista = umaMovimentacao({ id: 800, contaBancariaId: 1, tipo: 'entrada', valor: 500000, data: '2026-10-05', recorrenteOrigemId: 1, descricao: 'Salário' });
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-06', valor: 512345, descricao: 'CRED SALARIO EMPRESA X' })],
      semCategoria(1),
      naContaBB,
      dados({ movimentacoes: [prevista] })
    );
    expect(r).toMatchObject({ tipo: 'receita_prevista', movimentacaoId: 800 });
  });

  it('salário pelo texto', () => {
    const [r] = conciliarExtrato([linha({ valor: 450000, descricao: 'PROVENTOS EMPRESA X' })], semCategoria(1), naContaBB, dados());
    expect(r).toMatchObject({ tipo: 'salario' });
  });

  it('salário por recorrência: mesma fonte em 3 meses', () => {
    const t = [
      linha({ data: '2026-08-05', valor: 400000, descricao: 'TED RECEBIDA ACME LTDA' }),
      linha({ data: '2026-09-05', valor: 400000, descricao: 'TED RECEBIDA ACME LTDA' }),
      linha({ data: '2026-10-05', valor: 410000, descricao: 'TED RECEBIDA ACME LTDA' }),
    ];
    const r = conciliarExtrato(t, semCategoria(3), naContaBB, dados());
    expect(r.map((c) => c?.tipo)).toEqual(['salario', 'salario', 'salario']);
  });

  it('valor pequeno ou PIX de pessoa não vira salário', () => {
    const t = [
      linha({ data: '2026-08-05', valor: 5000, descricao: 'REND APLIC' }),
      linha({ data: '2026-09-05', valor: 5000, descricao: 'REND APLIC' }),
      linha({ data: '2026-10-05', valor: 5000, descricao: 'REND APLIC' }),
    ];
    expect(conciliarExtrato(t, semCategoria(3), naContaBB, dados()).every((c) => c === null)).toBe(true);
  });
});

describe('fatura do cartão', () => {
  const naFatura = { tipo: 'cartao' as const, cartaoId: 10 };

  it('parcela que já está no app não entra de novo', () => {
    const compra = umaCompra({ id: 40, descricao: 'Geladeira', numParcelas: 10, cartaoId: 10, valorTotal: 300000 });
    // mesReferencia da parcela de compra = mês de fechamento (out → vence 10/10)
    const parcela = umaParcela({ compraParceladaId: 40, numero: 3, valor: 30000, mesReferencia: '2026-10' });
    const r = conciliarExtrato(
      [
        linha({ data: '2026-07-20', valor: 30000, descricao: 'MAGAZINE LUIZA', parcela: { numero: 3, total: 10 } }),
        linha({ data: '2026-07-20', valor: 30000, descricao: 'MAGAZINE LUIZA', parcela: { numero: 4, total: 10 } }),
      ],
      semCategoria(2),
      naFatura,
      dados({ compras: [compra], parcelas: [parcela] }),
      '2026-10'
    );
    expect(r[0]).toMatchObject({ tipo: 'ja_na_fatura' });
    expect(r[1]).toBeNull();
  });

  it('conta fixa no cartão não entra de novo como compra', () => {
    const netflix = umaContaFixa({ id: 50, nome: 'Netflix', valor: 5590, formaPagamento: 'cartao', cartaoId: 10, diaVencimento: 10 });
    // cobrada dia 10/09: fecha 03/10 e vence 10/10
    const ocorrencia = umaParcela({ contaFixaId: 50, valor: 5590, mesReferencia: '2026-09' });
    const [r] = conciliarExtrato(
      [linha({ data: '2026-09-25', valor: 5590, descricao: 'NETFLIX.COM' })],
      semCategoria(1),
      naFatura,
      dados({ contasFixas: [netflix], parcelas: [ocorrencia] }),
      '2026-10'
    );
    expect(r?.tipo).toBe('ja_na_fatura');
  });
});

describe('casos da revisão', () => {
  it('receita prevista de outro mês não é confirmada (evita salário em dobro)', () => {
    const prevista = umaMovimentacao({ id: 801, contaBancariaId: 1, tipo: 'entrada', valor: 500000, data: '2026-11-01', recorrenteOrigemId: 1 });
    const [r] = conciliarExtrato(
      [linha({ data: '2026-10-31', valor: 500000, descricao: 'TED RECEBIDA ACME' })],
      semCategoria(1),
      naContaBB,
      dados({ movimentacoes: [prevista] })
    );
    expect(r?.tipo).not.toBe('receita_prevista');
  });

  it('PIX para uma pessoa e TED genérica de mesmo valor não viram transferência', () => {
    const entradaNoC6 = umaMovimentacao({ contaBancariaId: 2, tipo: 'entrada', valor: 20000, data: '2026-10-10', descricao: 'TED RECEBIDA' });
    const [r] = conciliarExtrato(
      [linha({ valor: -20000, descricao: 'PIX ENVIADO - JOAO PEREIRA' })],
      semCategoria(1),
      naContaBB,
      dados({ movimentacoes: [entradaNoC6] })
    );
    expect(r).toBeNull();
  });
});
