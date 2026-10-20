import { describe, expect, it } from '@jest/globals';
import { encontrarPagamentosSoltos, faturasAntigasEmAberto } from '@/domain/usecases/automacoes/faturasSoltas';
import type { DadosParaConciliar } from '@/domain/usecases/importacao/conciliar';
import { umCartao, umGasto, umaConta, umaMovimentacao } from '@/test/fabricas';

const cartao = umCartao({ id: 7, nome: 'C6 Carbon', diaFechamento: 3, diaVencimento: 10 });
const conta = umaConta({ id: 1, banco: 'Banco do Brasil', nomeConta: 'BB corrente' });
const noCartao = (data: string, valor: number) => umGasto({ data, valor, formaPagamento: 'cartao', cartaoId: 7, descricao: 'Compra' });

function dados(extra: Partial<DadosParaConciliar>): DadosParaConciliar {
  return { contas: [conta], cartoes: [cartao], contasFixas: [], parcelas: [], compras: [], gastos: [], faturas: [], movimentacoes: [], ...extra };
}

describe('pagamentos de fatura que entraram como gasto', () => {
  const gastos = [noCartao('2026-08-20', 30000), noCartao('2026-08-25', 20000), noCartao('2026-06-20', 12000)];
  const boleto = umaMovimentacao({ id: 90, contaBancariaId: 1, tipo: 'saida', valor: 50000, data: '2026-09-09', descricao: 'PAGAMENTO DE BOLETO BANCO C6' });
  const mercado = umaMovimentacao({ id: 91, contaBancariaId: 1, tipo: 'saida', valor: 50000, data: '2026-11-30', descricao: 'SUPERMERCADO' });
  const d = dados({ gastos, movimentacoes: [boleto, mercado] });

  it('acha o boleto com o valor da fatura perto do vencimento', () => {
    const soltos = encontrarPagamentosSoltos(d, '2026-10-20');
    expect(soltos).toHaveLength(1);
    expect(soltos[0]).toMatchObject({
      movimentacaoId: 90,
      totalDaFatura: 50000,
      pagamento: { cartaoId: 7, mesReferencia: '2026-09', dataVencimento: '2026-09-10', contaBancariaId: 1, valorPago: 50000 },
    });
  });

  it('a fatura antiga sem pagamento aparece para marcar como paga', () => {
    const soltos = encontrarPagamentosSoltos(d, '2026-10-20');
    const antigas = faturasAntigasEmAberto(d, '2026-10-20', soltos);
    expect(antigas.map((a) => [a.pagamento.mesReferencia, a.total, a.pagamento.contaBancariaId])).toEqual([['2026-07', 12000, null]]);
  });

  it('saída de valor diferente e sem texto de fatura não é pagamento', () => {
    const outra = umaMovimentacao({ id: 92, contaBancariaId: 1, tipo: 'saida', valor: 12345, data: '2026-09-09', descricao: 'PIX ENVIADO FULANO' });
    expect(encontrarPagamentosSoltos(dados({ gastos, movimentacoes: [outra] }), '2026-10-20')).toEqual([]);
  });
});
