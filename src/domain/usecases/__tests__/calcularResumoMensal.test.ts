import { describe, expect, it } from '@jest/globals';
import { calcularResumoMensal } from '@/domain/usecases/calcularResumoMensal';
import { umaMovimentacao, umaParcela, umGasto } from '@/test/fabricas';

describe('calcularResumoMensal', () => {
  const movimentacoes = [
    umaMovimentacao({ tipo: 'entrada', valor: 500000, data: '2026-04-05' }),
    // recebida em abril para cobrir maio: fica fora de abril
    umaMovimentacao({ tipo: 'entrada', valor: 100000, data: '2026-04-28', reservarProximoMes: true }),
    // recebida em março para cobrir abril: entra em abril
    umaMovimentacao({ tipo: 'entrada', valor: 80000, data: '2026-03-30', reservarProximoMes: true }),
    umaMovimentacao({ tipo: 'saida', valor: 20000, data: '2026-04-10' }),
    umaMovimentacao({ tipo: 'transferencia', valor: 30000, data: '2026-04-11', contaDestinoId: 2 }),
    umaMovimentacao({ tipo: 'saida', valor: 99900, data: '2026-03-15' }),
  ];
  const gastos = [umGasto({ valor: 5000, data: '2026-04-02' }), umGasto({ valor: 99900, data: '2026-05-01' })];
  const parcelas = [
    umaParcela({ valor: 10000, status: 'paga', dataPagamento: '2026-04-15', mesReferencia: '2026-03' }),
    umaParcela({ valor: 3000, status: 'paga', dataPagamento: null, mesReferencia: '2026-04' }),
    umaParcela({ valor: 99900, status: 'pendente', mesReferencia: '2026-04' }),
    umaParcela({ valor: 99900, status: 'paga', dataPagamento: '2026-03-31', mesReferencia: '2026-04' }),
  ];

  const resumo = calcularResumoMensal(movimentacoes, gastos, '2026-04', parcelas);

  it('receitas: entradas do mês mais as reservadas no mês anterior', () => {
    expect(resumo.receitas).toBe(580000);
    expect(resumo.reservadoParaEsteMes).toBe(80000);
  });

  it('despesas: saídas, gastos rápidos e parcelas pagas no mês; transferência não conta', () => {
    expect(resumo.despesas).toBe(38000);
  });

  it('saldo = receitas − despesas', () => {
    expect(resumo.saldo).toBe(542000);
  });
});
