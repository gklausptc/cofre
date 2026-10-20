import { describe, expect, it } from '@jest/globals';
import { planejarPagamentoContaFixa, planejarPagamentoFatura } from '@/domain/usecases/pagarFatura';
import { cofrinhoAtingiuMeta } from '@/domain/usecases/calcularProgressoCofrinho';
import { umAporte, umaContaFixa, umaParcela } from '@/test/fabricas';

const nubank = { id: 1, nome: 'Nubank', diaFechamento: 25, diaVencimento: 5 };

describe('planejarPagamentoFatura', () => {
  it('dá baixa nas parcelas, registra a fatura com as datas do cartão e lança a saída na conta', () => {
    const plano = planejarPagamentoFatura(
      { cartao: nubank, mesReferencia: '2026-04', valorPago: 45000, parcelaIds: [3, 7, 3], contaBancariaId: 2 },
      '2026-04-04'
    );

    expect(plano.parcelasAPagar).toEqual([3, 7]);
    expect(plano.registro).toEqual({
      cartaoId: 1,
      mesReferencia: '2026-04',
      dataFechamento: '2026-03-25',
      dataVencimento: '2026-04-05',
      contaBancariaId: 2,
      valorPago: 45000,
      dataPagamento: '2026-04-04',
    });
    expect(plano.saida).toEqual({
      contaBancariaId: 2,
      tipo: 'saida',
      valor: 45000,
      data: '2026-04-04',
      descricao: 'Fatura Nubank',
      categoriaId: null,
      membroId: null,
      origem: 'fatura',
      contaDestinoId: null,
      reservarProximoMes: false,
      recorrente: false,
      recorrenteOrigemId: null,
      faturaId: null,
      parcelaId: null,
    });
  });

  it('"não descontar de conta" registra a fatura paga sem saída', () => {
    const plano = planejarPagamentoFatura(
      { cartao: nubank, mesReferencia: '2026-04', valorPago: 100, parcelaIds: [], contaBancariaId: null },
      '2026-04-04'
    );
    expect(plano.registro.contaBancariaId).toBeNull();
    expect(plano.saida).toBeNull();
  });

  it('fatura zerada não gera saída', () => {
    const plano = planejarPagamentoFatura(
      { cartao: nubank, mesReferencia: '2026-04', valorPago: 0, parcelaIds: [], contaBancariaId: 2 },
      '2026-04-04'
    );
    expect(plano.saida).toBeNull();
  });
});

describe('planejarPagamentoContaFixa', () => {
  const internet = umaContaFixa({
    id: 10,
    nome: 'Internet',
    formaPagamento: 'debito',
    contaBancariaId: 1,
    categoriaId: 5,
    membroId: 2,
  });

  it('conta fixa no débito/pix/boleto com conta: baixa + saída na conta, com categoria e membro', () => {
    const plano = planejarPagamentoContaFixa(umaParcela({ id: 30, contaFixaId: 10, valor: 9990 }), internet, '2026-04-20');

    expect(plano.parcelaId).toBe(30);
    expect(plano.dataPagamento).toBe('2026-04-20');
    expect(plano.saida).toMatchObject({
      contaBancariaId: 1,
      tipo: 'saida',
      valor: 9990,
      data: '2026-04-20',
      descricao: 'Internet',
      categoriaId: 5,
      membroId: 2,
      origem: 'conta_fixa',
    });
  });

  it('conta fixa no cartão não gera saída: é paga junto com a fatura', () => {
    const noCartao = { ...internet, formaPagamento: 'cartao' as const, contaBancariaId: null, cartaoId: 1 };
    expect(planejarPagamentoContaFixa(umaParcela({ contaFixaId: 10, valor: 100 }), noCartao, '2026-04-20').saida).toBeNull();
  });

  it('conta fixa sem conta bancária só dá baixa', () => {
    const semConta = { ...internet, formaPagamento: 'boleto' as const, contaBancariaId: null };
    expect(planejarPagamentoContaFixa(umaParcela({ contaFixaId: 10, valor: 100 }), semConta, '2026-04-20').saida).toBeNull();
  });

  it('parcela de compra parcelada não gera saída', () => {
    expect(planejarPagamentoContaFixa(umaParcela({ compraParceladaId: 3, valor: 100 }), null, '2026-04-20').saida).toBeNull();
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
