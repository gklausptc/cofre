import { describe, expect, it } from '@jest/globals';
import { planejarPagamentoFatura } from '@/domain/usecases/pagarFatura';
import { cofrinhoAtingiuMeta } from '@/domain/usecases/calcularProgressoCofrinho';
import { umAporte } from '@/test/fabricas';

describe('planejarPagamentoFatura', () => {
  const nubank = { id: 1, diaFechamento: 25, diaVencimento: 5 };

  it('dá baixa nas parcelas e registra a fatura com as datas do cartão', () => {
    const plano = planejarPagamentoFatura(
      { cartao: nubank, mesReferencia: '2026-04', valorPago: 45000, parcelaIds: [3, 7, 3], contaBancariaId: 2 },
      '2026-04-04'
    );

    expect(plano).toEqual({
      parcelasAPagar: [3, 7],
      dataPagamento: '2026-04-04',
      registro: {
        cartaoId: 1,
        mesReferencia: '2026-04',
        dataFechamento: '2026-03-25',
        dataVencimento: '2026-04-05',
        contaBancariaId: 2,
        valorPago: 45000,
        dataPagamento: '2026-04-04',
      },
    });
  });

  it('pagamento sem descontar de conta', () => {
    const plano = planejarPagamentoFatura(
      { cartao: nubank, mesReferencia: '2026-04', valorPago: 100, parcelaIds: [], contaBancariaId: null },
      '2026-04-04'
    );
    expect(plano.registro.contaBancariaId).toBeNull();
  });
});

describe('cofrinhoAtingiuMeta', () => {
  it('ativo que chegou na meta', () => {
    expect(cofrinhoAtingiuMeta({ valorMeta: 10000, status: 'ativo' }, [umAporte({ valor: 6000 }), umAporte({ valor: 4000 })])).toBe(
      true
    );
  });

  it('ainda não chegou', () => {
    expect(cofrinhoAtingiuMeta({ valorMeta: 10000, status: 'ativo' }, [umAporte({ valor: 9999 })])).toBe(false);
  });

  it('já concluído ou sem meta não conclui de novo', () => {
    expect(cofrinhoAtingiuMeta({ valorMeta: 10000, status: 'concluido' }, [umAporte({ valor: 20000 })])).toBe(false);
    expect(cofrinhoAtingiuMeta({ valorMeta: 0, status: 'ativo' }, [])).toBe(false);
  });
});
