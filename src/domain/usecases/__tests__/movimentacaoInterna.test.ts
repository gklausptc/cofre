import { describe, expect, it } from '@jest/globals';
import { calcularResumoMensal } from '@/domain/usecases/calcularResumoMensal';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { ehDespesa, ehMovimentoInterno, ehReceita } from '@/domain/usecases/naturezaMovimentacao';
import { normalizarDescricao } from '@/domain/usecases/importacao/normalizarDescricao';
import { deduplicar } from '@/domain/usecases/importacao/deduplicar';
import { umaConta, umaMovimentacao } from '@/test/fabricas';

describe("entrada e saída 'interna' (de/para outra conta sua fora do app)", () => {
  const conta = umaConta({ id: 1, saldoInicial: 10000 });
  const salario = umaMovimentacao({ id: 1, contaBancariaId: 1, tipo: 'entrada', valor: 300000, data: '2026-10-05' });
  const daPoupanca = umaMovimentacao({ id: 2, contaBancariaId: 1, tipo: 'entrada', origem: 'interna', valor: 8000, data: '2026-10-09' });
  const paraOutroBanco = umaMovimentacao({ id: 3, contaBancariaId: 1, tipo: 'saida', origem: 'interna', valor: 5000, data: '2026-10-10' });
  const movimentacoes = [salario, daPoupanca, paraOutroBanco];

  it('conta no saldo, mas não é receita nem despesa', () => {
    expect(calcularSaldoConta(conta, movimentacoes, [])).toBe(10000 + 300000 + 8000 - 5000);
    expect(calcularResumoMensal(movimentacoes, [], '2026-10')).toMatchObject({ receitas: 300000, despesas: 0 });
    expect([ehReceita(daPoupanca), ehDespesa(paraOutroBanco), ehMovimentoInterno(daPoupanca)]).toEqual([false, false, true]);
  });

  it('na camada unificada vira transferência', () => {
    const lancamentos = obterLancamentosDoPeriodo('2026-10-01', '2026-10-31', { movimentacoes }, '2026-10-20');
    expect(lancamentos.map((l) => [l.id, l.natureza])).toEqual(
      expect.arrayContaining([
        ['mov-1', 'receita'],
        ['mov-2', 'transferencia'],
        ['mov-3', 'transferencia'],
      ])
    );
  });
});

describe('importação', () => {
  it('o nome do PIX do BB sai sem "PIX ENVIADO"', () => {
    expect(normalizarDescricao('Pix - Enviado 01/10 07:37 FULANO DE TAL').pix?.nome).toBe('FULANO DE TAL');
    expect(normalizarDescricao('Pix Automatico - Envio 14/10 06:00 Ebanx').pix?.nome).toBe('EBANX');
  });

  it('o outro lado de uma transferência entre contas suas já está no app, mesmo com outro texto', () => {
    const [situacao] = deduplicar(
      [{ data: '2026-10-09', valor: -8000, descricao: 'Transferência para conta corrente', idExterno: 'p1', parcela: null, linha: 1 }],
      [{ id: 'mov-9', data: '2026-10-09', valor: -8000, descricao: 'Transferido da poupança', idExterno: 'c1', transferencia: true }]
    );
    expect(situacao).toMatchObject({ tipo: 'duplicata', existenteId: 'mov-9' });
  });
});
