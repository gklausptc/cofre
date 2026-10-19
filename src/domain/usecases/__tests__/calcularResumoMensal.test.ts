import { describe, expect, it } from '@jest/globals';
import { calcularResumoMensal } from '@/domain/usecases/calcularResumoMensal';
import { umaMovimentacao, umaParcela, umGasto } from '@/test/fabricas';

describe('calcularResumoMensal', () => {
  const movimentacoes = [
    umaMovimentacao({ tipo: 'entrada', valor: 5000, data: '2026-04-05' }),
    // recebida em abril para cobrir maio: fica fora de abril
    umaMovimentacao({ tipo: 'entrada', valor: 1000, data: '2026-04-28', reservarProximoMes: true }),
    // recebida em março para cobrir abril: entra em abril
    umaMovimentacao({ tipo: 'entrada', valor: 800, data: '2026-03-30', reservarProximoMes: true }),
    umaMovimentacao({ tipo: 'saida', valor: 200, data: '2026-04-10' }),
    umaMovimentacao({ tipo: 'transferencia', valor: 300, data: '2026-04-11', contaDestinoId: 2 }),
    umaMovimentacao({ tipo: 'saida', valor: 999, data: '2026-03-15' }),
  ];
  const gastos = [umGasto({ valor: 50, data: '2026-04-02' }), umGasto({ valor: 999, data: '2026-05-01' })];
  const parcelas = [
    umaParcela({ valor: 100, status: 'paga', dataPagamento: '2026-04-15', mesReferencia: '2026-03' }),
    umaParcela({ valor: 30, status: 'paga', dataPagamento: null, mesReferencia: '2026-04' }),
    umaParcela({ valor: 999, status: 'pendente', mesReferencia: '2026-04' }),
    umaParcela({ valor: 999, status: 'paga', dataPagamento: '2026-03-31', mesReferencia: '2026-04' }),
  ];

  const resumo = calcularResumoMensal(movimentacoes, gastos, '2026-04', parcelas);

  it('receitas: entradas do mês mais as reservadas no mês anterior', () => {
    expect(resumo.receitas).toBe(5800);
    expect(resumo.reservadoParaEsteMes).toBe(800);
  });

  it('despesas: saídas, gastos rápidos e parcelas pagas no mês; transferência não conta', () => {
    expect(resumo.despesas).toBe(380);
  });

  it('saldo = receitas − despesas', () => {
    expect(resumo.saldo).toBe(5420);
  });
});
