import { describe, expect, it } from '@jest/globals';
import {
  backupsAutomaticosParaApagar,
  descreverIdadeBackup,
  interpretarNomeBackupAutomatico,
  montarBackup,
  nomeArquivoBackup,
  nomeBackupAutomatico,
  ordenarBackupsAutomaticos,
  prepararTabelasParaRestaurar,
  resumirBackup,
  textoResumoBackup,
  validarBackup,
  type LinhaBackup,
  type TabelasBackup,
} from '@/domain/usecases/backup';

const agora = new Date(2026, 9, 16, 14, 32, 5);

function comoArquivo(valor: unknown): unknown {
  return JSON.parse(JSON.stringify(valor));
}

const tabelasValidas: TabelasBackup = {
  categorias: [{ id: 1, nome: 'Mercado', tipo: 'despesa', is_padrao: 1 }],
  movimentacoes: [{ id: 1, valor: 10.5, descricao: null }],
};

describe('montarBackup e nomeArquivoBackup', () => {
  it('monta o arquivo com formato, versões e data', () => {
    expect(montarBackup(tabelasValidas, 5, agora)).toEqual({
      formato: 'cofre-backup',
      versaoFormato: 1,
      versaoSchema: 5,
      criadoEm: agora.toISOString(),
      tabelas: tabelasValidas,
    });
  });

  it('nome do arquivo com a data', () => {
    expect(nomeArquivoBackup(agora)).toBe('cofre-backup-2026-10-16.json');
  });
});

describe('validarBackup', () => {
  it('aceita um backup da mesma versão, sem alterar os dados', () => {
    const resultado = validarBackup(comoArquivo(montarBackup(tabelasValidas, 5, agora)), 5);
    expect(resultado).toEqual({ ok: true, backup: montarBackup(tabelasValidas, 5, agora) });
  });

  it('aceita backup de versão anterior e o traz para a versão atual', () => {
    const resultado = validarBackup(comoArquivo(montarBackup(tabelasValidas, 3, agora)), 5);
    expect(resultado.ok && resultado.backup.versaoSchema).toBe(5);
  });

  it('backup de antes dos centavos (até a versão 5) tem o dinheiro convertido de reais para centavos', () => {
    const antigo = montarBackup(
      {
        categorias: [{ id: 1, nome: 'Mercado' }],
        movimentacoes: [{ id: 1, valor: 10.07, descricao: 'Pão', conta_bancaria_id: 2 }],
        parcelas: [{ id: 1, valor: 33.33, valor_original: null, numero: 3 }],
        contas_bancarias: [{ id: 1, saldo_inicial: -1234.56 }],
        reserva_emergencia: [{ id: 1, valor_meta: 15000, valor_atual: 1234.5, meses_cobertura_desejados: 6 }],
        metas_financeiras: [{ id: 1, nome: 'Carro', valor_meta: 45000, valor_atual: 0.5 }],
      },
      5,
      agora
    );
    const resultado = validarBackup(comoArquivo(antigo), 6);
    if (!resultado.ok) throw new Error(resultado.erro);

    expect(resultado.backup.tabelas.movimentacoes).toEqual([{ id: 1, valor: 1007, descricao: 'Pão', conta_bancaria_id: 2 }]);
    expect(resultado.backup.tabelas.parcelas).toEqual([{ id: 1, valor: 3333, valor_original: null, numero: 3 }]);
    expect(resultado.backup.tabelas.contas_bancarias).toEqual([{ id: 1, saldo_inicial: -123456 }]);
    expect(resultado.backup.tabelas.reserva_emergencia).toEqual([
      { id: 1, valor_meta: 1500000, valor_atual: 123450, meses_cobertura_desejados: 6 },
    ]);
    expect(resultado.backup.tabelas.metas_financeiras).toEqual([{ id: 1, nome: 'Carro', valor_meta: 4500000, valor_atual: 50 }]);
    expect(resultado.backup.tabelas.categorias).toEqual([{ id: 1, nome: 'Mercado' }]);
  });

  it('backup já em centavos (versão 6) não é convertido de novo', () => {
    const atual = montarBackup({ categorias: [], movimentacoes: [{ id: 1, valor: 1007 }] }, 6, agora);
    const resultado = validarBackup(comoArquivo(atual), 6);
    expect(resultado.ok && resultado.backup.tabelas.movimentacoes).toEqual([{ id: 1, valor: 1007 }]);
  });

  it('backup de antes da versão 7 ganha as saídas dos pagamentos de conta fixa e de fatura', () => {
    const antigo = montarBackup(
      {
        categorias: [],
        cartoes: [{ id: 1, nome: 'Nubank' }],
        contas_fixas: [
          { id: 10, nome: 'Internet', forma_pagamento: 'debito', conta_bancaria_id: 1, categoria_id: 5, membro_id: null },
          { id: 11, nome: 'Streaming', forma_pagamento: 'cartao', conta_bancaria_id: null, categoria_id: null, membro_id: null },
        ],
        parcelas: [
          { id: 1, conta_fixa_id: 10, valor: 9990, status: 'paga', data_pagamento: '2026-03-20', mes_referencia: '2026-03' },
          { id: 2, conta_fixa_id: 10, valor: 9990, status: 'pendente', data_pagamento: null, mes_referencia: '2026-04' },
          { id: 3, conta_fixa_id: 11, valor: 1500, status: 'paga', data_pagamento: '2026-03-20', mes_referencia: '2026-03' },
        ],
        faturas: [
          {
            id: 7,
            cartao_id: 1,
            status: 'paga',
            conta_bancaria_id: 1,
            valor_pago: 45000,
            data_pagamento: '2026-04-04',
            data_vencimento: '2026-04-05',
          },
          {
            id: 8,
            cartao_id: 1,
            status: 'paga',
            conta_bancaria_id: null,
            valor_pago: 1000,
            data_pagamento: '2026-03-04',
            data_vencimento: '2026-03-05',
          },
        ],
        movimentacoes: [{ id: 41, tipo: 'entrada', valor: 100000, conta_bancaria_id: 1 }],
      },
      6,
      agora
    );
    const resultado = validarBackup(comoArquivo(antigo), 7);
    if (!resultado.ok) throw new Error(resultado.erro);

    const camposPadrao = {
      tipo: 'saida',
      conta_destino_id: null,
      reservar_proximo_mes: 0,
      recorrente: 0,
      recorrente_origem_id: null,
    };
    expect(resultado.backup.tabelas.movimentacoes).toEqual([
      { id: 41, tipo: 'entrada', valor: 100000, conta_bancaria_id: 1 },
      {
        ...camposPadrao,
        id: 42,
        fatura_id: null,
        parcela_id: 1,
        conta_bancaria_id: 1,
        valor: 9990,
        data: '2026-03-20',
        descricao: 'Internet',
        categoria_id: 5,
        membro_id: null,
        origem: 'conta_fixa',
      },
      {
        ...camposPadrao,
        id: 43,
        fatura_id: 7,
        parcela_id: null,
        conta_bancaria_id: 1,
        valor: 45000,
        data: '2026-04-04',
        descricao: 'Fatura Nubank',
        categoria_id: null,
        membro_id: null,
        origem: 'fatura',
      },
    ]);
  });

  it('recusa backup de uma versão mais nova do app', () => {
    const resultado = validarBackup(comoArquivo(montarBackup(tabelasValidas, 6, agora)), 5);
    expect(resultado).toEqual({ ok: false, erro: expect.stringContaining('mais nova') });
  });

  it('recusa o que não é backup do Cofre', () => {
    const naoEBackup = { ok: false, erro: 'Esse arquivo não é um backup do Cofre.' };
    expect(validarBackup(null, 5)).toEqual(naoEBackup);
    expect(validarBackup([], 5)).toEqual(naoEBackup);
    expect(validarBackup('texto', 5)).toEqual(naoEBackup);
    expect(validarBackup({ ...montarBackup(tabelasValidas, 5, agora), formato: 'outro' }, 5)).toEqual(naoEBackup);
    expect(validarBackup({ ...montarBackup({ movimentacoes: [] }, 5, agora) }, 5)).toEqual(naoEBackup);
    expect(validarBackup({ ...montarBackup(tabelasValidas, 5, agora), criadoEm: 'ontem' }, 5)).toEqual(naoEBackup);
  });

  it('recusa formato de backup desconhecido', () => {
    const resultado = validarBackup({ ...montarBackup(tabelasValidas, 5, agora), versaoFormato: 2 }, 5);
    expect(resultado).toEqual({ ok: false, erro: expect.stringContaining('formato') });
  });

  it('recusa células que não são texto, número ou vazio', () => {
    const comObjeto = { ...montarBackup(tabelasValidas, 5, agora), tabelas: { categorias: [{ id: { a: 1 } }] } };
    const comBooleano = { ...montarBackup(tabelasValidas, 5, agora), tabelas: { categorias: [{ ativo: true }] } };
    expect(validarBackup(comObjeto, 5).ok).toBe(false);
    expect(validarBackup(comBooleano, 5).ok).toBe(false);
  });
});

describe('resumirBackup', () => {
  it('conta lançamentos (movimentações + gastos), contas e cartões ativos', () => {
    const resumo = resumirBackup({
      tabelas: {
        categorias: [{ id: 1 }],
        movimentacoes: [{ id: 1 }, { id: 2 }],
        gastos_rapidos: [{ id: 1 }],
        contas_bancarias: [
          { id: 1, ativo: 1 },
          { id: 2, ativo: 0 },
        ],
        cartoes: [
          { id: 1, ativo: 1 },
          { id: 2, ativo: 1 },
        ],
        cofrinhos: [],
      },
    });

    expect(resumo).toEqual([
      { rotulo: 'lançamentos', quantidade: 3 },
      { rotulo: 'conta bancária', quantidade: 1 },
      { rotulo: 'cartões', quantidade: 2 },
    ]);
    expect(textoResumoBackup(resumo)).toBe('3 lançamentos · 1 conta bancária · 2 cartões');
  });

  it('backup vazio', () => {
    expect(textoResumoBackup(resumirBackup({ tabelas: { categorias: [] } }))).toBe(
      'Nenhum lançamento, conta ou cartão cadastrado.'
    );
  });
});

describe('prepararTabelasParaRestaurar', () => {
  const doBackup: LinhaBackup = {
    id: 1,
    tema: 'escuro',
    bloqueio_ativo: 0,
    biometria_ativa: 0,
    tutorial_concluido: 1,
    ultimo_backup_em: null,
  };
  const doAparelho: LinhaBackup = {
    id: 1,
    tema: 'claro',
    bloqueio_ativo: 1,
    biometria_ativa: 1,
    tutorial_concluido: 0,
    ultimo_backup_em: '2026-10-01T12:00:00.000Z',
  };

  it('traz as preferências do backup, mas mantém bloqueio, biometria e último backup do aparelho', () => {
    const tabelas = prepararTabelasParaRestaurar({ tabelas: { ...tabelasValidas, preferencias: [doBackup] } }, doAparelho);

    expect(tabelas.preferencias).toEqual([
      {
        id: 1,
        tema: 'escuro',
        tutorial_concluido: 1,
        bloqueio_ativo: 1,
        biometria_ativa: 1,
        ultimo_backup_em: '2026-10-01T12:00:00.000Z',
      },
    ]);
    expect(tabelas.movimentacoes).toEqual(tabelasValidas.movimentacoes);
  });

  it('backup sem preferências mantém as do aparelho', () => {
    expect(prepararTabelasParaRestaurar({ tabelas: tabelasValidas }, doAparelho).preferencias).toEqual([doAparelho]);
  });

  it('não altera o backup original', () => {
    const backup = { tabelas: { ...tabelasValidas, preferencias: [doBackup] } };
    prepararTabelasParaRestaurar(backup, doAparelho);
    expect(backup.tabelas.preferencias).toEqual([doBackup]);
  });
});

describe('cópias automáticas', () => {
  it('nome com data, hora e motivo, e leitura de volta', () => {
    const nome = nomeBackupAutomatico(agora, 'antes-de-restaurar');
    expect(nome).toBe('cofre-auto-2026-10-16-143205-antes-de-restaurar.json');
    expect(interpretarNomeBackupAutomatico(nome)).toEqual({ nome, criadoEm: agora, motivo: 'antes-de-restaurar' });
    expect(interpretarNomeBackupAutomatico('cofre-backup-2026-10-16.json')).toBeNull();
  });

  it('ordena da mais nova para a mais antiga e mantém só as 5 mais recentes', () => {
    const nomes = [1, 2, 3, 4, 5, 6, 7].map((dia) => nomeBackupAutomatico(new Date(2026, 9, dia, 9), 'antes-da-atualizacao'));
    const embaralhados = [nomes[3], nomes[0], nomes[6], 'outro-arquivo.json', nomes[1], nomes[5], nomes[2], nomes[4]];

    expect(ordenarBackupsAutomaticos(embaralhados).map((info) => info.criadoEm.getDate())).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(backupsAutomaticosParaApagar(embaralhados).sort()).toEqual([nomes[0], nomes[1]].sort());
  });
});

describe('descreverIdadeBackup', () => {
  const hoje = new Date(2026, 9, 19, 10, 0, 0);
  const diasAtras = (dias: number) => new Date(2026, 9, 19 - dias, 8, 0, 0).toISOString();

  it('nunca fez backup: lembra', () => {
    expect(descreverIdadeBackup(null, hoje)).toEqual({ texto: 'Você ainda não fez nenhum backup.', precisaLembrar: true });
  });

  it('descreve hoje, ontem e há N dias', () => {
    expect(descreverIdadeBackup(diasAtras(0), hoje).texto).toBe('Último backup: hoje.');
    expect(descreverIdadeBackup(diasAtras(1), hoje).texto).toBe('Último backup: ontem.');
    expect(descreverIdadeBackup(diasAtras(3), hoje).texto).toBe('Último backup: há 3 dias.');
  });

  it('lembra só depois de 7 dias', () => {
    expect(descreverIdadeBackup(diasAtras(7), hoje).precisaLembrar).toBe(false);
    expect(descreverIdadeBackup(diasAtras(8), hoje).precisaLembrar).toBe(true);
  });
});
