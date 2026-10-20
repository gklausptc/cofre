import { describe, expect, it } from '@jest/globals';
import {
  CONFIANCA_MINIMA,
  categorizar,
  historicoDeCategorias,
  pareceNomeDePessoa,
  prepararCategorizador,
  type ContextoCategorizacao,
} from '@/domain/usecases/importacao/categorizar';
import { COMERCIANTES } from '@/domain/dados/comerciantes';
import { CATEGORIAS_PADRAO } from '@/domain/dados/categoriasPadrao';
import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import { umContatoPix, umaCategoria, umaMovimentacao, umaRegra, umGasto } from '@/test/fabricas';

const categorias = [
  umaCategoria({ id: 1, nome: 'Alimentação' }),
  umaCategoria({ id: 2, nome: 'Transporte' }),
  umaCategoria({ id: 3, nome: 'Moradia' }),
  umaCategoria({ id: 4, nome: 'Saúde' }),
  umaCategoria({ id: 5, nome: 'Educação' }),
  umaCategoria({ id: 6, nome: 'Lazer' }),
  umaCategoria({ id: 7, nome: 'Compras' }),
  umaCategoria({ id: 8, nome: 'Assinaturas' }),
  umaCategoria({ id: 9, nome: 'Outros gastos' }),
  umaCategoria({ id: 10, nome: 'Salário', tipo: 'receita' }),
  umaCategoria({ id: 11, nome: 'Outras receitas', tipo: 'receita' }),
];

const vazio: ContextoCategorizacao = { categorias, regras: [], contatos: [], historico: [] };
const despesa = (descricao: string, extra: { categoriaDoBanco?: string } = {}) =>
  ({ descricao, natureza: 'despesa' as const, ...extra });

describe('dicionário de comerciantes', () => {
  it('tem pelo menos 150 comerciantes, todos com categoria padrão existente', () => {
    expect(COMERCIANTES.length).toBeGreaterThanOrEqual(150);
    const nomes = new Set(CATEGORIAS_PADRAO.map((c) => semAcentos(c.nome)));
    for (const comerciante of COMERCIANTES) expect(nomes.has(semAcentos(comerciante.categoria))).toBe(true);
  });

  it('reconhece comerciantes comuns com confiança 0,9', () => {
    const casos: [string, number][] = [
      ['IFD*PIZZARIA BELLA NAPOLI', 1],
      ['UBER *TRIP HELP.UBER.COM', 2],
      ['NETFLIX.COM', 8],
      ['DROGASIL 1234 SAO PAULO', 4],
      ['COMPRA CARTAO - POSTO SHELL AV BRASIL', 2],
      ['MERCADOLIVRE*VENDEDOR', 7],
      ['SMARTFIT ACADEMIA', 4],
      ['ENEL DISTRIBUICAO SP', 3],
      ['PAG*ZE DELIVERY', 1],
      ['AMAZON MARKETPLACE', 7],
    ];
    for (const [descricao, categoriaId] of casos) {
      const r = categorizar(despesa(descricao), vazio);
      expect({ descricao, categoriaId: r.categoriaId, camada: r.camada }).toEqual({ descricao, categoriaId, camada: 'dicionario' });
      expect(r.confianca).toBe(0.9);
    }
  });

  it('marca assinaturas', () => {
    expect(categorizar(despesa('SPOTIFY P1234'), vazio).assinatura).toBe(true);
    expect(categorizar(despesa('CARREFOUR HIPER'), vazio).assinatura).toBe(false);
  });

  it('não usa o dicionário em entradas', () => {
    expect(categorizar({ descricao: 'UBER DO BRASIL REPASSE', natureza: 'receita' }, vazio).camada).not.toBe('dicionario');
  });

  it('padrão só casa com palavra inteira', () => {
    // "VIVO" não pode casar com "VIVORA"; "SHELL" não casa com "SHELLY"
    expect(categorizar(despesa('LOJA VIVORA'), vazio).camada).not.toBe('dicionario');
    expect(categorizar(despesa('SHELLY MODAS'), vazio).camada).not.toBe('dicionario');
  });

  it('sobrenome comum não vira comerciante', () => {
    const r = categorizar(despesa('PIX ENVIADO - JOAO PACHECO SILVA'), vazio);
    expect(r.categoriaId).toBeNull();
    expect(r.pessoaPix).toBe('JOAO PACHECO SILVA');
  });
});

describe('palavras-chave e categoria do banco', () => {
  it('reconhece pelo começo da palavra, com 0,7', () => {
    const r = categorizar(despesa('FARMACIA SAO JOAO LTDA'), vazio);
    expect(r).toMatchObject({ categoriaId: 4, camada: 'palavra_chave', confianca: 0.7 });
    expect(categorizar(despesa('AUTO POSTO TRES IRMAOS'), vazio).categoriaId).toBe(2);
    expect(categorizar(despesa('PADARIA DONA ANA'), vazio).categoriaId).toBe(1);
  });

  it('entrada com SALARIO é Salário', () => {
    expect(categorizar({ descricao: 'CRED SALARIO EMPRESA X', natureza: 'receita' }, vazio)).toMatchObject({
      categoriaId: 10,
      camada: 'palavra_chave',
    });
  });

  it('usa a categoria que o banco mandou quando não conhece o comerciante', () => {
    const r = categorizar(despesa('ESTABELECIMENTO QUALQUER', { categoriaDoBanco: 'Restaurante / Lanchonete / Bar' }), vazio);
    expect(r).toMatchObject({ categoriaId: 1, camada: 'banco', confianca: 0.8 });
  });

  it('categoria genérica do banco não decide', () => {
    expect(categorizar(despesa('ESTABELECIMENTO QUALQUER', { categoriaDoBanco: 'Serviços' }), vazio).categoriaId).toBeNull();
  });
});

describe('regras e contatos do usuário', () => {
  it('regra vence o dicionário, com confiança 1', () => {
    const regras = [umaRegra({ id: 50, padrao: 'AMAZON', categoriaId: 5 })];
    const r = categorizar(despesa('AMAZON MARKETPLACE'), { ...vazio, regras });
    expect(r).toMatchObject({ categoriaId: 5, camada: 'regra', confianca: 1, regraId: 50 });
  });

  it('regra exata vence regra de "contém"', () => {
    const regras = [
      umaRegra({ id: 1, padrao: 'POSTO', categoriaId: 2 }),
      umaRegra({ id: 2, padrao: 'POSTO DO ZE', tipoCorrespondencia: 'exato', categoriaId: 1 }),
    ];
    expect(categorizar(despesa('POSTO DO ZE'), { ...vazio, regras }).regraId).toBe(2);
    expect(categorizar(despesa('POSTO CENTRAL'), { ...vazio, regras }).regraId).toBe(1);
  });

  it('regra de "começa com" e natureza', () => {
    const regras = [umaRegra({ padrao: 'REND', tipoCorrespondencia: 'comeca_com', natureza: 'receita', categoriaId: 11 })];
    expect(categorizar({ descricao: 'REND PAGO APLIC AUT', natureza: 'receita' }, { ...vazio, regras }).camada).toBe('regra');
    expect(categorizar(despesa('REND PAGO APLIC AUT'), { ...vazio, regras }).camada).not.toBe('regra');
  });

  it('regra com ação especial vale mesmo sem categoria', () => {
    const regras = [umaRegra({ padrao: 'APLICACAO RDB', acao: 'transferencia_propria' })];
    expect(categorizar(despesa('APLICACAO RDB'), { ...vazio, regras })).toMatchObject({
      acao: 'transferencia_propria',
      categoriaId: null,
      confianca: 1,
    });
  });

  it('regra apontando para categoria apagada é ignorada', () => {
    const regras = [umaRegra({ padrao: 'NETFLIX', categoriaId: 999 })];
    expect(categorizar(despesa('NETFLIX.COM'), { ...vazio, regras }).camada).toBe('dicionario');
  });

  it('contato PIX: categoria, membro e conta própria', () => {
    const contatos = [
      umContatoPix({ id: 70, nomeNormalizado: 'MARIA DA SILVA SANTOS', apelido: 'Diarista', categoriaId: 3, membroId: 2 }),
      umContatoPix({ id: 71, nomeNormalizado: 'GREGORY KLAUS', apelido: 'Eu', tipo: 'propria' }),
    ];
    const contexto = { ...vazio, contatos };
    expect(categorizar(despesa('PIX ENVIADO - MARIA DA SILVA SANTOS'), contexto)).toMatchObject({
      categoriaId: 3,
      membroId: 2,
      camada: 'contato',
      contatoPixId: 70,
    });
    // banco que corta o nome
    expect(categorizar(despesa('PIX ENVIADO MARIA DA SILVA SAN'), contexto).contatoPixId).toBe(70);
    expect(categorizar(despesa('PIX ENVIADO GREGORY KLAUS'), contexto).acao).toBe('transferencia_propria');
  });
});

describe('histórico', () => {
  it('descrição igual já categorizada', () => {
    const historico = historicoDeCategorias(
      [umaMovimentacao({ tipo: 'saida', descricao: 'BAZAR DA ESQUINA', categoriaId: 7 })],
      [umGasto({ descricao: 'Bazar da Esquina', categoriaId: 7 })]
    );
    const r = categorizar(despesa('BAZAR DA ESQUINA'), { ...vazio, historico });
    expect(r).toMatchObject({ categoriaId: 7, camada: 'historico', confianca: 0.8 });
  });

  it('uma vez só: 0,7', () => {
    const historico = [{ descricao: 'BAZAR DA ESQUINA', categoriaId: 7, natureza: 'despesa' as const }];
    expect(categorizar(despesa('BAZAR DA ESQUINA'), { ...vazio, historico }).confianca).toBe(0.7);
  });

  it('descrição parecida: sugere com 0,6 (vira pergunta)', () => {
    const historico = [{ descricao: 'BAZAR DA ESQUINA LTDA', categoriaId: 7, natureza: 'despesa' as const }];
    const r = categorizar(despesa('BAZAR DA ESQUINA FILIAL'), { ...vazio, historico });
    expect(r).toMatchObject({ categoriaId: 7, confianca: 0.6 });
    expect(r.confianca).toBeLessThan(CONFIANCA_MINIMA);
  });

  it('ignora transferências e pagamentos de fatura no histórico', () => {
    const historico = historicoDeCategorias(
      [
        umaMovimentacao({ tipo: 'transferencia', descricao: 'X', categoriaId: 1 }),
        umaMovimentacao({ tipo: 'saida', descricao: 'Fatura C6', categoriaId: 1, origem: 'fatura', faturaId: 3 }),
      ],
      []
    );
    expect(historico).toEqual([]);
  });
});

describe('PIX para pessoa', () => {
  it('reconhece nome de pessoa e não de empresa', () => {
    expect(pareceNomeDePessoa('MARIA DA SILVA')).toBe(true);
    expect(pareceNomeDePessoa('PADARIA PAO QUENTE LTDA')).toBe(false);
    expect(pareceNomeDePessoa('NETFLIX')).toBe(false);
    expect(pareceNomeDePessoa('CLARO S A')).toBe(false);
    expect(pareceNomeDePessoa('JOAO 123')).toBe(false);
  });

  it('PIX para pessoa desconhecida não é categorizado por palavra-chave', () => {
    const r = categorizar(despesa('PIX ENVIADO - ANA CLUBE SOUZA'), vazio);
    expect(r).toMatchObject({ categoriaId: null, pessoaPix: 'ANA CLUBE SOUZA', motivo: 'PIX para pessoa' });
  });
});

describe('desempenho', () => {
  it('categoriza 500 linhas com histórico grande rapidamente', () => {
    const historico = Array.from({ length: 2000 }, (_, i) => ({
      descricao: `LOJA NUMERO ${i % 400} CENTRO`,
      categoriaId: 7,
      natureza: 'despesa' as const,
    }));
    const categorizador = prepararCategorizador({ ...vazio, historico });
    const inicio = Date.now();
    for (let i = 0; i < 500; i++) categorizador(despesa(`LOJA NUMERO ${i} BAIRRO`));
    expect(Date.now() - inicio).toBeLessThan(3000);
  });
});
