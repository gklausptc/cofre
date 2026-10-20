import { describe, expect, it } from '@jest/globals';
import {
  LIMITE_AGENDADAS,
  amanhaAsNove,
  planejarNotificacoes,
  textoDoResumoSemanal,
  type EntradaDoPlanejamento,
} from '@/domain/usecases/notificacoes/planejarNotificacoes';
import { CONFIG_PADRAO, lerAdiamentos, lerConfigNotificacoes } from '@/domain/usecases/notificacoes/configNotificacoes';
import { formatarMoeda } from '@/core/utils/currency';
import { marcoAtingido, textoDoMarco } from '@/domain/usecases/notificacoes/marcosDaMeta';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

// terça, 20/10/2026, meio-dia (horário local)
const agora = new Date(2026, 9, 20, 12, 0, 0);

function lancamento(dados: Partial<LancamentoDoPeriodo>): LancamentoDoPeriodo {
  return {
    id: 'parcela-1',
    tipo: 'conta_fixa',
    natureza: 'despesa',
    status: 'previsto',
    valor: 10000,
    data: '2026-10-25',
    competencia: '2026-10',
    descricao: 'Conta',
    origem: 'conta_fixa',
    noCartao: false,
    contaBancariaId: 1,
    cartaoId: null,
    categoriaId: null,
    membroId: null,
    link: '/conta-fixa/1',
    ...dados,
  };
}

const semLembretes = {
  ...CONFIG_PADRAO,
  fechamento_mes: { ...CONFIG_PADRAO.fechamento_mes, ativo: false },
  lembrete_backup: { ...CONFIG_PADRAO.lembrete_backup, ativo: false },
  lembrete_importacao: { ...CONFIG_PADRAO.lembrete_importacao, ativo: false },
};

function entrada(dados: Partial<EntradaDoPlanejamento>): EntradaDoPlanejamento {
  return {
    agora,
    config: semLembretes,
    lancamentos: [],
    cartoes: [],
    contasFixasDaImportacao: new Set(),
    ultimasImportacoes: [],
    referenciaBackup: null,
    resumoSemanal: null,
    adiamentos: {},
    ...dados,
  };
}

const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}h`;

describe('vencimentos', () => {
  const luz = lancamento({ id: 'parcela-12', descricao: 'Conta de luz', valor: 18240, link: '/conta-fixa/3' });

  it('2 dias antes e no dia, às 9h, com ação de marcar como paga; e atrasada no dia seguinte', () => {
    const r = planejarNotificacoes(entrada({ lancamentos: [luz] }));
    expect(r.map((n) => [n.tipo, local(n.data), n.titulo])).toEqual([
      ['vencimento_conta_fixa', '2026-10-23 09h', 'Conta de luz vence em 2 dias'],
      ['vencimento_conta_fixa', '2026-10-25 09h', 'Conta de luz vence hoje'],
      ['conta_atrasada', '2026-10-26 10h', 'Conta de luz venceu ontem'],
    ]);
    expect(r[0]).toMatchObject({
      categoria: 'conta_fixa',
      parcelaId: 12,
      url: '/agenda?mes=2026-10&item=parcela-12',
      corpo: `${formatarMoeda(18240)}. Toque para marcar como paga.`,
    });
  });

  it('pagas e no cartão não avisam; horário que já passou também não', () => {
    expect(planejarNotificacoes(entrada({ lancamentos: [{ ...luz, status: 'pago' }] }))).toEqual([]);
    expect(planejarNotificacoes(entrada({ lancamentos: [{ ...luz, noCartao: true }] }))).toEqual([]);
    const hojeCedo = planejarNotificacoes(entrada({ lancamentos: [{ ...luz, data: '2026-10-20' }] }));
    expect(hojeCedo.map((n) => n.tipo)).toEqual(['conta_atrasada']);
  });

  it('várias no mesmo dia viram um aviso só, com o total', () => {
    const agua = lancamento({ id: 'parcela-13', descricao: 'Água', valor: 9000, link: '/conta-fixa/4' });
    const r = planejarNotificacoes(entrada({ lancamentos: [luz, agua], config: { ...semLembretes, conta_atrasada: { ...CONFIG_PADRAO.conta_atrasada, ativo: false } } }));
    expect(r.map((n) => [n.titulo, n.corpo, n.categoria])).toEqual([
      ['2 contas vencem em 2 dias', `${formatarMoeda(27240)}: Conta de luz, Água.`, 'lembrete'],
      ['2 contas vencem hoje', `${formatarMoeda(27240)}: Conta de luz, Água.`, 'lembrete'],
    ]);
  });

  it('desligado não agenda; antecedência configurável', () => {
    const desligado = { ...semLembretes, vencimento_conta_fixa: { ...CONFIG_PADRAO.vencimento_conta_fixa, ativo: false }, conta_atrasada: { ...CONFIG_PADRAO.conta_atrasada, ativo: false } };
    expect(planejarNotificacoes(entrada({ lancamentos: [luz], config: desligado }))).toEqual([]);
    const umDia = { ...semLembretes, vencimento_conta_fixa: { ativo: true, diasAntes: [1], hora: 8 }, conta_atrasada: { ...CONFIG_PADRAO.conta_atrasada, ativo: false } };
    expect(planejarNotificacoes(entrada({ lancamentos: [luz], config: umDia })).map((n) => [local(n.data), n.titulo])).toEqual([
      ['2026-10-24 08h', 'Conta de luz vence amanhã'],
    ]);
  });

  it('conta fixa criada na importação usa o próprio liga/desliga', () => {
    const config = { ...semLembretes, recorrencia_importada: { ...CONFIG_PADRAO.recorrencia_importada, ativo: false }, conta_atrasada: { ...CONFIG_PADRAO.conta_atrasada, ativo: false } };
    const r = planejarNotificacoes(entrada({ lancamentos: [luz], config, contasFixasDaImportacao: new Set([3]) }));
    expect(r).toEqual([]);
  });

  it('fatura: vencimento com o valor e fechamento', () => {
    const fatura = lancamento({
      id: 'fatura-10-2026-11',
      tipo: 'fatura',
      natureza: 'fatura',
      descricao: 'Fatura C6',
      valor: 123456,
      data: '2026-11-10',
      competencia: '2026-11',
      cartaoId: 10,
      link: '/cartao/10',
    });
    const r = planejarNotificacoes(
      entrada({
        lancamentos: [fatura],
        cartoes: [{ id: 10, nome: 'C6', diaFechamento: 3, diaVencimento: 10 }],
        config: { ...semLembretes, conta_atrasada: { ...CONFIG_PADRAO.conta_atrasada, ativo: false } },
      })
    );
    expect(r.map((n) => [n.tipo, local(n.data), n.titulo, n.url])).toEqual([
      ['fechamento_fatura', '2026-11-01 09h', 'Fatura do C6 fecha em 2 dias', '/cartao/10'],
      ['vencimento_fatura', '2026-11-08 09h', 'Fatura C6 vence em 2 dias', '/agenda?mes=2026-11&item=fatura-10'],
      ['vencimento_fatura', '2026-11-10 09h', 'Fatura C6 vence hoje', '/agenda?mes=2026-11&item=fatura-10'],
    ]);
    expect(r[1].corpo).toBe(`${formatarMoeda(123456)} previstos.`);
  });
});

describe('limite, adiamento e lembretes', () => {
  it('no máximo 60 agendadas, as mais próximas primeiro', () => {
    const muitas = Array.from({ length: 40 }, (_, i) =>
      lancamento({ id: `parcela-${i}`, data: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, link: `/conta-fixa/${i}`, descricao: `Conta ${i}` })
    );
    const r = planejarNotificacoes(entrada({ lancamentos: muitas }));
    expect(r).toHaveLength(LIMITE_AGENDADAS);
    for (let i = 1; i < r.length; i++) expect(r[i].data.getTime()).toBeGreaterThanOrEqual(r[i - 1].data.getTime());
  });

  it('"Lembrar amanhã" troca a data e vale mesmo depois do horário original', () => {
    const luz = lancamento({ id: 'parcela-12', data: '2026-10-20', descricao: 'Luz', link: '/conta-fixa/3' });
    const amanha = amanhaAsNove(agora);
    const r = planejarNotificacoes(entrada({ lancamentos: [luz], adiamentos: { 'venc-parcela-12-0': amanha.toISOString() } }));
    expect(r.map((n) => [n.id, local(n.data)])).toContainEqual(['venc-parcela-12-0', '2026-10-21 09h']);
  });

  it('lembrete de importar a cada 7 dias depois da última, e de backup', () => {
    const r = planejarNotificacoes(
      entrada({
        config: CONFIG_PADRAO,
        ultimasImportacoes: [{ chave: 'conta-1', nome: 'BB', quando: '2026-10-10T15:00:00' }],
        referenciaBackup: '2026-10-19T08:00:00',
      })
    );
    const importar = r.find((n) => n.tipo === 'lembrete_importacao');
    expect(importar && [local(importar.data), importar.titulo, importar.corpo.slice(0, 18)]).toEqual([
      '2026-10-24 19h',
      'Importe o extrato: BB',
      'Faz 14 dias que vo',
    ]);
    const backup = r.find((n) => n.tipo === 'lembrete_backup');
    expect(backup && local(backup.data)).toBe('2026-10-26 20h');
    const fechamento = r.find((n) => n.tipo === 'fechamento_mes');
    expect(fechamento && [local(fechamento.data), fechamento.titulo]).toEqual(['2026-11-01 09h', 'Outubro terminou']);
  });

  it('resumo semanal no domingo às 19h, só se ligado', () => {
    const config = { ...semLembretes, resumo_semanal: { ativo: true, hora: 19 } };
    const r = planejarNotificacoes(entrada({ config, resumoSemanal: 'Você gastou R$ 10,00 nesta semana.' }));
    expect(r.map((n) => [n.tipo, local(n.data)])).toEqual([['resumo_semanal', '2026-10-25 19h']]);
    expect(planejarNotificacoes(entrada({ resumoSemanal: 'x' }))).toEqual([]);
  });
});

describe('configuração e textos', () => {
  it('lê a configuração salva por cima do padrão e limita o horário', () => {
    const config = lerConfigNotificacoes(JSON.stringify({ resumo_semanal: { ativo: true, hora: 23 }, desconhecido: {} }));
    expect(config.resumo_semanal).toEqual({ ativo: true, hora: 21 });
    expect(config.vencimento_conta_fixa).toEqual(CONFIG_PADRAO.vencimento_conta_fixa);
    expect(lerConfigNotificacoes('lixo')).toEqual(CONFIG_PADRAO);
  });

  it('adiamentos vencidos somem', () => {
    const json = JSON.stringify({ a: '2026-10-19T09:00:00.000Z', b: '2026-10-22T09:00:00.000Z' });
    expect(Object.keys(lerAdiamentos(json, agora))).toEqual(['b']);
  });

  it('resumo semanal com média e maior categoria', () => {
    const despesa = (data: string, valor: number, categoriaId: number) => ({ natureza: 'despesa' as const, data, valor, categoriaId });
    const lancs = [
      despesa('2026-10-19', 30000, 1),
      despesa('2026-10-20', 10000, 2),
      despesa('2026-10-13', 20000, 1),
      despesa('2026-10-06', 20000, 1),
    ];
    const texto = textoDoResumoSemanal(lancs, agora, (id) => (id === 1 ? 'Alimentação' : 'Lazer'));
    expect(texto).toBe(`Você gastou ${formatarMoeda(40000)} nesta semana, 100% acima da média. Maior categoria: Alimentação (${formatarMoeda(30000)}).`);
    expect(textoDoResumoSemanal([], agora, () => '')).toBeNull();
  });
});

describe('marcos da meta do cofrinho', () => {
  it('avisa o maior marco que o aporte passou', () => {
    expect(marcoAtingido(0, 2500, 10000)).toBe(25);
    expect(marcoAtingido(2000, 8000, 10000)).toBe(75);
    expect(marcoAtingido(9000, 10000, 10000)).toBe(100);
    expect(marcoAtingido(10000, 12000, 10000)).toBeNull();
    expect(marcoAtingido(3000, 4000, 10000)).toBeNull();
    expect(marcoAtingido(0, 100, 0)).toBeNull();
  });

  it('texto', () => {
    expect(textoDoMarco(100, 'Viagem')).toEqual({ titulo: 'Meta atingida: Viagem', corpo: 'Você completou o valor do cofrinho.' });
    expect(textoDoMarco(50, 'Viagem')).toEqual({ titulo: 'Viagem: 50% da meta', corpo: 'Falta 50% para completar.' });
  });
});
