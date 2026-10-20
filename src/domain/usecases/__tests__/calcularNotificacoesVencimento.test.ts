import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { calcularNotificacoesVencimento } from '@/domain/usecases/calcularNotificacoesVencimento';
import { formatarMoeda } from '@/core/utils/currency';
import { umaCompra, umaContaFixa, umaParcela, umCartao } from '@/test/fabricas';

const luz = umaContaFixa({ id: 10, nome: 'Luz', diaVencimento: 10 });
const nubank = umCartao({ id: 1, nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 });
const inter = umCartao({ id: 2, nome: 'Inter', diaFechamento: 3, diaVencimento: 10 });
const tv = umaCompra({ id: 1, descricao: 'TV', cartaoId: 1 });

describe('calcularNotificacoesVencimento', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // 15/03/2026
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('conta fixa: lembrete às 9h do dia anterior ao vencimento', () => {
    const parcela = umaParcela({ id: 100, contaFixaId: 10, valor: 12000, mesReferencia: '2026-04' });
    const [item] = calcularNotificacoesVencimento([luz], [], [], [parcela]);

    expect(item).toEqual({
      identificador: 'conta-fixa-100',
      titulo: 'Luz vence amanhã',
      corpo: `${formatarMoeda(12000)} · dia 10`,
      data: new Date(2026, 3, 9, 9, 0, 0),
    });
  });

  it('parcela no cartão: lembrete na véspera do vencimento da fatura em que ela cai', () => {
    // fecha em abril (mesReferencia) e, como o Nubank vence antes de fechar, vence em 05/05
    const parcela = umaParcela({ id: 101, compraParceladaId: 1, numero: 2, valor: 30000, mesReferencia: '2026-04' });
    const [item] = calcularNotificacoesVencimento([], [nubank], [tv], [parcela]).filter((i) =>
      i.identificador.startsWith('parcela-cartao')
    );

    expect(item.identificador).toBe('parcela-cartao-101');
    expect(item.titulo).toBe('Fatura do Nubank vence amanhã');
    expect(item.corpo).toBe(`Parcela 2 de "TV" · ${formatarMoeda(30000)}`);
    expect(item.data).toEqual(new Date(2026, 4, 4, 9, 0, 0));
  });

  it('avisa o fechamento só dos cartões com compra parcelada ativa', () => {
    const fechamentos = calcularNotificacoesVencimento([], [nubank, inter], [tv], []);

    expect(fechamentos).toEqual([
      {
        identificador: 'fechamento-cartao-1-2026-03',
        titulo: 'Nubank fecha amanhã',
        corpo: 'Confira as compras do mês antes do fechamento da fatura.',
        data: new Date(2026, 2, 24, 9, 0, 0),
      },
    ]);
  });
});
