import { describe, expect, it } from '@jest/globals';
import {
  detectarParcelamentos,
  detectarRecorrencias,
  limparDescricaoDaParcela,
  maiorSequenciaDeMeses,
  type LinhaGravada,
} from '@/domain/usecases/importacao/detectarPadroes';
import { montarFilaDePerguntas } from '@/domain/usecases/importacao/montarFilaDePerguntas';
import { planejarResposta } from '@/domain/usecases/importacao/responderPergunta';
import { analisarImportacao, existentesDoDestino, linhaDoItem, montarRegistroDeImportacao } from '@/domain/usecases/importacao/analisarImportacao';
import { prepararCategorizador } from '@/domain/usecases/importacao/categorizar';
import type { ExtratoLido, TransacaoLida } from '@/domain/usecases/importacao/tipos';
import type { DadosDaPergunta } from '@/domain/types/perguntas';
import { formatarMoeda } from '@/core/utils/currency';
import { umCartao, umGasto, umaCategoria, umaCompra, umaConta, umaContaFixa, umaMovimentacao, umaParcela } from '@/test/fabricas';

function linha(dados: Partial<TransacaoLida>): TransacaoLida {
  return { data: '2026-10-10', descricao: 'X', valor: -1000, idExterno: 'x', parcela: null, linha: 1, ...dados };
}
function gravada(t: Partial<TransacaoLida>, onde: LinhaGravada['onde'] = 'movimentacao'): LinhaGravada {
  return { transacao: linha(t), onde, categoriaId: null, membroId: null, categorizacao: null };
}

const categorias = [
  umaCategoria({ id: 1, nome: 'Alimentação' }),
  umaCategoria({ id: 3, nome: 'Moradia' }),
  umaCategoria({ id: 7, nome: 'Compras' }),
  umaCategoria({ id: 8, nome: 'Assinaturas' }),
  umaCategoria({ id: 10, nome: 'Salário', tipo: 'receita' }),
];
const categorizar = prepararCategorizador({ categorias, regras: [], contatos: [], historico: [] });
const cartao = umCartao({ id: 10, nome: 'C6', diaFechamento: 3, diaVencimento: 10 });

describe('detectarParcelamentos', () => {
  const naFatura = { tipo: 'cartao' as const, cartaoId: 10 };

  it('parcela nova vira candidata; a última e a que já existe não', () => {
    const existente = umaCompra({ id: 5, cartaoId: 10, descricao: 'Geladeira', numParcelas: 10, valorTotal: 300000 });
    const r = detectarParcelamentos(
      [
        gravada({ idExterno: 'a', valor: 19590, descricao: 'MAGAZINE LUIZA', parcela: { numero: 3, total: 10 } }, 'gasto'),
        gravada({ idExterno: 'b', valor: 5000, descricao: 'LOJA FINAL 06/06' }, 'gasto'),
        gravada({ idExterno: 'c', valor: 30000, descricao: 'GELADEIRA', parcela: { numero: 4, total: 10 } }, 'gasto'),
      ],
      naFatura,
      cartao,
      '2026-11',
      [existente],
      [umaParcela({ compraParceladaId: 5, valor: 30000 })]
    );
    expect(r.map((p) => [p.linha.transacao.idExterno, p.marca, p.mesDaFatura])).toEqual([['a', { numero: 3, total: 10 }, '2026-11']]);
  });

  it('limpa a descrição', () => {
    expect(limparDescricaoDaParcela('LOJA X PARC 03/10 (compra em 05/06/2026)')).toBe('LOJA X');
    expect(limparDescricaoDaParcela('MAGALU 3/10')).toBe('MAGALU');
  });
});

describe('detectarRecorrencias', () => {
  const chaveDe = (descricao: string) => {
    const c = categorizar({ descricao, natureza: 'despesa' });
    return c.comerciante
      ? { chave: `com:${c.comerciante}`, nome: c.comerciante, assinatura: c.assinatura }
      : { chave: `txt:${descricao}`, nome: descricao, assinatura: false };
  };
  const base = { chaveDe, movimentacoes: [], gastos: [], contasFixas: [], regras: [] };

  it('3 meses seguidos, mesmo valor e dia: candidata (somando o histórico do app)', () => {
    const r = detectarRecorrencias({
      ...base,
      linhas: [gravada({ idExterno: 'n', data: '2026-10-12', valor: -5590, descricao: 'NETFLIX.COM' })],
      movimentacoes: [
        umaMovimentacao({ tipo: 'saida', data: '2026-08-12', valor: 5590, descricao: 'Netflix' }),
        umaMovimentacao({ tipo: 'saida', data: '2026-09-11', valor: 5590, descricao: 'NETFLIX ENTRETENIMENTO' }),
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nome: 'Netflix', valor: 5590, dia: 12, meses: ['2026-08', '2026-09', '2026-10'], assinatura: true });
  });

  it('dois meses, mês faltando no meio ou valor muito diferente: não', () => {
    const linhas = [gravada({ idExterno: 'n', data: '2026-10-12', valor: -5590, descricao: 'NETFLIX.COM' })];
    expect(
      detectarRecorrencias({ ...base, linhas, movimentacoes: [umaMovimentacao({ tipo: 'saida', data: '2026-09-12', valor: 5590, descricao: 'NETFLIX' })] })
    ).toEqual([]);
    expect(
      detectarRecorrencias({
        ...base,
        linhas,
        movimentacoes: [
          umaMovimentacao({ tipo: 'saida', data: '2026-07-12', valor: 5590, descricao: 'NETFLIX' }),
          umaMovimentacao({ tipo: 'saida', data: '2026-08-12', valor: 5590, descricao: 'NETFLIX' }),
        ],
      })
    ).toEqual([]);
    expect(
      detectarRecorrencias({
        ...base,
        linhas,
        movimentacoes: [
          umaMovimentacao({ tipo: 'saida', data: '2026-08-12', valor: 9990, descricao: 'NETFLIX' }),
          umaMovimentacao({ tipo: 'saida', data: '2026-09-12', valor: 9990, descricao: 'NETFLIX' }),
        ],
      })
    ).toEqual([]);
  });

  it('comerciante de muitas vezes no mês (Uber) não vira conta fixa', () => {
    const linhas = [
      gravada({ idExterno: '1', data: '2026-10-05', valor: -2000, descricao: 'UBER TRIP' }),
      gravada({ idExterno: '2', data: '2026-10-06', valor: -2100, descricao: 'UBER TRIP' }),
      gravada({ idExterno: '3', data: '2026-10-07', valor: -1900, descricao: 'UBER TRIP' }),
    ];
    const movimentacoes = ['2026-08-05', '2026-09-05'].map((data) => umaMovimentacao({ tipo: 'saida', data, valor: 2000, descricao: 'UBER TRIP' }));
    expect(detectarRecorrencias({ ...base, linhas, movimentacoes })).toEqual([]);
  });

  it('o que já é conta fixa ou parcela fica de fora', () => {
    const linhas = [gravada({ idExterno: 'n', data: '2026-10-12', valor: -5590, descricao: 'NETFLIX.COM' })];
    const movimentacoes = ['2026-08-12', '2026-09-12'].map((data) => umaMovimentacao({ tipo: 'saida', data, valor: 5590, descricao: 'NETFLIX' }));
    expect(
      detectarRecorrencias({ ...base, linhas, movimentacoes, contasFixas: [umaContaFixa({ nome: 'Netflix', valor: 5590 })] })
    ).toEqual([]);
    const parcela = [gravada({ idExterno: 'p', data: '2026-10-12', valor: -5000, descricao: 'LOJA X 03/10' })];
    const antigas = ['2026-08-12', '2026-09-12'].map((data) => umaMovimentacao({ tipo: 'saida', data, valor: 5000, descricao: 'LOJA X 01/10' }));
    expect(detectarRecorrencias({ ...base, linhas: parcela, movimentacoes: antigas })).toEqual([]);
  });

  it('maior sequência de meses', () => {
    expect(maiorSequenciaDeMeses(['2026-01', '2026-02', '2026-04', '2026-05', '2026-06'])).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(maiorSequenciaDeMeses(['2025-12', '2026-01'])).toEqual(['2025-12', '2026-01']);
  });
});

describe('montarFilaDePerguntas', () => {
  const bb = umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'BB' });
  const destino = { tipo: 'conta' as const, contaBancariaId: 1 };
  const extrato: ExtratoLido = {
    formato: 'csv',
    banco: 'bb',
    origem: 'conta',
    ignoradas: 0,
    periodo: null,
    vencimentoFatura: null,
    transacoes: [
      linha({ idExterno: 'p1', data: '2026-10-03', valor: -15000, descricao: 'PIX ENVIADO - MARIA DA SILVA' }),
      linha({ idExterno: 'p2', data: '2026-10-17', valor: -15000, descricao: 'PIX ENVIADO - MARIA DA SILVA' }),
      linha({ idExterno: 'x1', data: '2026-10-05', valor: -3000, descricao: 'XPTO COMERCIAL' }),
      linha({ idExterno: 'x2', data: '2026-10-20', valor: -4500, descricao: 'XPTO COMERCIAL' }),
      linha({ idExterno: 'n', data: '2026-10-12', valor: -5590, descricao: 'NETFLIX.COM' }),
      linha({ idExterno: 'd', data: '2026-10-09', valor: -4590, descricao: 'PADARIA SAO JOSE' }),
    ],
  };
  const movimentacoes = [
    umaMovimentacao({ id: 501, contaBancariaId: 1, tipo: 'saida', data: '2026-08-12', valor: 5590, descricao: 'NETFLIX' }),
    umaMovimentacao({ id: 502, contaBancariaId: 1, tipo: 'saida', data: '2026-09-12', valor: 5590, descricao: 'NETFLIX' }),
    umaMovimentacao({ id: 503, contaBancariaId: 1, tipo: 'saida', data: '2026-10-09', valor: 4590, descricao: 'Lanche' }),
  ];
  const dados = { contas: [bb], cartoes: [], contasFixas: [], parcelas: [], compras: [], gastos: [], faturas: [], movimentacoes };
  const analise = analisarImportacao(extrato, destino, existentesDoDestino(destino, movimentacoes, []), { categorizar, dados, categorias });
  const linhas = analise.itens.filter((i) => i.incluirPorPadrao).map((i) => linhaDoItem(i));
  const registro = montarRegistroDeImportacao({ arquivo: 'x', extrato, destino, linhas, agora: new Date() });
  const fila = montarFilaDePerguntas({
    extrato,
    destino,
    itens: analise.itens,
    registro,
    cartao: null,
    mesDaFatura: null,
    categorizar,
    movimentacoes,
    gastos: [],
    contasFixas: [],
    compras: [],
    parcelas: [],
    regras: [],
    descricaoDoExistente: (id) => {
      const m = movimentacoes.find((x) => `mov-${x.id}` === id);
      return m ? { descricao: m.descricao ?? '', data: m.data, valor: m.valor } : null;
    },
  });

  it('agrupa e ordena pelo impacto', () => {
    expect(fila.map((p) => [p.tipo, p.quantidade, p.valor])).toEqual([
      ['recorrencia', 1, 5590 * 12],
      ['pix_pessoa', 2, 30000],
      ['categoria', 2, 7500],
      ['duplicidade', 1, 4590],
    ]);
    expect(fila[1].titulo).toBe('Quem é MARIA DA SILVA?');
    expect(fila[1].pista).toBe(`2 PIX enviados, ${formatarMoeda(30000)} no total`);
    expect(fila[0].pista).toBe(`Netflix: ${formatarMoeda(5590)} todo dia 12 há 3 meses · parece assinatura`);
  });

  it('a dúvida de duplicidade leva o que gravar se forem diferentes', () => {
    const dup = fila[3].dados;
    expect(dup.tipo).toBe('duplicidade');
    if (dup.tipo !== 'duplicidade') return;
    expect(dup.existente).toEqual({ descricao: 'Lanche', data: '2026-10-09', valor: 4590 });
    expect(dup.registro.movimentacao).toMatchObject({ valor: 4590, idExterno: 'd', categoriaId: 1 });
  });
});

describe('planejarResposta', () => {
  const agora = new Date(Date.UTC(2026, 9, 20, 12));
  const contexto = { agora, cartoes: [cartao], gastos: [] };
  const linhas = [{ importacaoId: 7, idExterno: 'a', onde: 'movimentacao' as const }];

  it('categoria com "sempre": atualiza e cria regra', () => {
    const dados: DadosDaPergunta = { tipo: 'categoria', natureza: 'despesa', padrao: 'XPTO COMERCIAL', exemplo: 'XPTO', sugestaoCategoriaId: null, linhas };
    const plano = planejarResposta(dados, { tipo: 'categoria', categoriaId: 7, sempre: true }, contexto);
    expect(plano.atualizarLinhas).toEqual({ categoriaId: 7 });
    expect(plano.regra).toMatchObject({ padrao: 'XPTO COMERCIAL', natureza: 'despesa', categoriaId: 7, acao: 'categorizar' });
    expect(planejarResposta(dados, { tipo: 'categoria', categoriaId: 7, sempre: false }, contexto).regra).toBeNull();
  });

  it('PIX: diarista vira contato com categoria; conta minha vira transferência', () => {
    const dados: DadosDaPergunta = { tipo: 'pix_pessoa', natureza: 'despesa', nome: 'MARIA DA SILVA', exemplo: 'PIX', linhas };
    const diarista = planejarResposta(
      dados,
      { tipo: 'contato', contato: 'servico', apelido: 'Diarista', categoriaId: 3, membroId: null, outraContaId: null, sempre: true },
      contexto
    );
    expect(diarista.atualizarLinhas).toEqual({ categoriaId: 3, membroId: null });
    expect(diarista.contato).toMatchObject({ nomeNormalizado: 'MARIA DA SILVA', apelido: 'Diarista', tipo: 'servico', categoriaId: 3 });
    const minha = planejarResposta(
      dados,
      { tipo: 'contato', contato: 'propria', apelido: 'Eu', categoriaId: null, membroId: null, outraContaId: 2, sempre: true },
      contexto
    );
    expect(minha.transferencia).toEqual({ contaDestinoId: 2, origemDasEntradas: 2 });
    const emprestimo = planejarResposta(
      dados,
      { tipo: 'contato', contato: 'emprestimo', apelido: 'Primo', categoriaId: null, membroId: null, outraContaId: null, sempre: false },
      contexto
    );
    expect(emprestimo).toMatchObject({ transferencia: { contaDestinoId: null, origemDasEntradas: null }, contato: null });
  });

  it('parcelamento: compra de N vezes com as anteriores pagas e o gasto vira parcela', () => {
    const antiga = umGasto({ id: 90, cartaoId: 10, formaPagamento: 'cartao', descricao: 'MAGAZINE LUIZA 02/10', valor: 19590 });
    const dados: DadosDaPergunta = {
      tipo: 'parcelamento',
      descricao: 'MAGAZINE LUIZA',
      valorParcela: 19590,
      numero: 3,
      total: 10,
      cartaoId: 10,
      mesDaFatura: '2026-11',
      dataCompra: '2026-08-20',
      categoriaId: 7,
      membroId: null,
      linhas: [{ importacaoId: 7, idExterno: 'a', onde: 'gasto' }],
    };
    const plano = planejarResposta(dados, { tipo: 'parcelamento', criar: true }, { ...contexto, gastos: [antiga] });
    expect(plano.apagarLinhas).toBe(true);
    expect(plano.apagarGastos).toEqual([90]);
    expect(plano.compraParcelada).toEqual({
      dados: {
        descricao: 'MAGAZINE LUIZA',
        valorTotal: 195900,
        numParcelas: 10,
        cartaoId: 10,
        categoriaId: 7,
        dataCompra: '2026-08-20',
        membroId: null,
      },
      // fatura que vence 10/11 fecha 03/11: parcela 3 em nov → parcela 1 em set
      mesPrimeiraParcela: '2026-09',
      pagas: [
        { numero: 1, dataPagamento: '2026-09-10' },
        { numero: 2, dataPagamento: '2026-10-10' },
      ],
    });
    expect(planejarResposta(dados, { tipo: 'parcelamento', criar: false }, contexto).compraParcelada).toBeNull();
  });

  it('recorrência: conta fixa a partir do mês seguinte e regra de conta fixa', () => {
    const dados: DadosDaPergunta = {
      tipo: 'recorrencia',
      nome: 'Netflix',
      padrao: 'NETFLIX COM',
      valor: 5590,
      dia: 12,
      meses: ['2026-08', '2026-09', '2026-10'],
      assinatura: true,
      destino: { tipo: 'cartao', cartaoId: 10 },
      categoriaId: 8,
      linhas,
    };
    const plano = planejarResposta(dados, { tipo: 'recorrencia', criar: true, nome: 'Netflix', valor: 5590, dia: 12, sempre: true }, contexto);
    expect(plano.contaFixa?.dados).toMatchObject({
      nome: 'Netflix',
      valor: 5590,
      diaVencimento: 12,
      formaPagamento: 'cartao',
      cartaoId: 10,
      contaBancariaId: null,
      recorrencia: 'mensal',
      dataInicio: '2026-11-01',
      categoriaId: 8,
    });
    expect(plano.contaFixa?.regra).toMatchObject({ padrao: 'NETFLIX COM', acao: 'conta_fixa' });
  });

  it('duplicidade: "são diferentes" grava a linha; "é o mesmo" não faz nada', () => {
    const dados: DadosDaPergunta = {
      tipo: 'duplicidade',
      linha: { data: '2026-10-09', descricao: 'PADARIA', valor: -4590, idExterno: 'd' },
      existente: { descricao: 'Lanche', data: '2026-10-09', valor: 4590 },
      registro: { movimentacao: null, gasto: null },
      linhas: [],
    };
    expect(planejarResposta(dados, { tipo: 'duplicidade', mesmo: false }, contexto).inserir).toEqual({ movimentacao: null, gasto: null });
    expect(planejarResposta(dados, { tipo: 'duplicidade', mesmo: true }, contexto).inserir).toBeNull();
  });
});

describe('parcelamento absorve as outras parcelas já importadas', () => {
  it('também a parcela mais nova de outra importação', () => {
    const nova = umGasto({ id: 91, cartaoId: 10, formaPagamento: 'cartao', descricao: 'MAGAZINE LUIZA 04/10', valor: 19590 });
    const antiga = umGasto({ id: 90, cartaoId: 10, formaPagamento: 'cartao', descricao: 'MAGAZINE LUIZA 02/10', valor: 19590 });
    const outra = umGasto({ id: 92, cartaoId: 10, formaPagamento: 'cartao', descricao: 'OUTRA LOJA 04/10', valor: 19590 });
    const dados: DadosDaPergunta = {
      tipo: 'parcelamento',
      descricao: 'MAGAZINE LUIZA',
      valorParcela: 19590,
      numero: 3,
      total: 10,
      cartaoId: 10,
      mesDaFatura: '2026-11',
      dataCompra: '2026-08-20',
      categoriaId: 7,
      membroId: null,
      linhas: [{ importacaoId: 7, idExterno: 'a', onde: 'gasto' }],
    };
    const plano = planejarResposta(dados, { tipo: 'parcelamento', criar: true }, { agora: new Date(), cartoes: [cartao], gastos: [antiga, nova, outra] });
    expect(plano.apagarGastos.sort()).toEqual([90, 91]);
  });
});
