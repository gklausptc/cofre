import { describe, expect, it } from '@jest/globals';
import { montarAnaliseCompleta, planilhaDaAnalise } from '@/domain/usecases/analiseCompleta';
import { umCartao, umaCategoria, umaConta, umaMovimentacao, umGasto } from '@/test/fabricas';

const corrente = umaConta({ id: 1, nomeConta: 'BB · Conta corrente', saldoInicial: 10000 });
const poupanca = umaConta({ id: 2, nomeConta: 'BB · Poupança', saldoInicial: 50000 });
const cartao = umCartao({ id: 1, nome: 'C6', diaFechamento: 25, diaVencimento: 5 });
const mercado = umaCategoria({ id: 3, nome: 'Mercado', tipo: 'despesa' });

const analise = montarAnaliseCompleta({
  dados: {
    movimentacoes: [
      umaMovimentacao({ id: 1, contaBancariaId: 1, tipo: 'entrada', valor: 300000, data: '2026-10-05', descricao: 'Salário' }),
      umaMovimentacao({ id: 2, contaBancariaId: 2, tipo: 'transferencia', contaDestinoId: 1, valor: 20000, data: '2026-10-06', descricao: 'Da poupança' }),
      umaMovimentacao({ id: 3, contaBancariaId: 1, tipo: 'entrada', origem: 'interna', valor: 5000, data: '2026-10-07', descricao: 'PIX do meu nome' }),
    ],
    gastos: [
      umGasto({ id: 1, valor: 8000, data: '2026-10-08', formaPagamento: 'pix', contaBancariaId: 1, categoriaId: 3, descricao: 'Mercado' }),
      umGasto({ id: 2, valor: 86000, data: '2026-10-10', formaPagamento: 'cartao', cartaoId: 1, categoriaId: 3, descricao: 'Compras' }),
    ],
    cartoes: [cartao],
  },
  contas: [corrente, poupanca],
  categorias: [mercado],
  membros: [],
  hoje: '2026-10-20',
  geradoEm: '2026-10-20T12:00:00.000Z',
});

describe('montarAnaliseCompleta', () => {
  it('cada lançamento diz se entra, sai ou só passa entre contas', () => {
    expect(analise.lancamentos.map((l) => [l.id, l.natureza, l.sentido, l.conta, l.contaDestino])).toEqual([
      ['mov-1', 'receita', 'entra', 'BB · Conta corrente', null],
      ['mov-2', 'transferencia', 'entre_contas', 'BB · Poupança', 'BB · Conta corrente'],
      ['mov-3', 'transferencia', 'entra', 'BB · Conta corrente', null],
      ['gasto-1', 'despesa', 'sai', 'BB · Conta corrente', null],
      ['gasto-2', 'despesa', 'sai', null, null],
      ['fatura-1-2026-11', 'fatura', 'so_soma', null, null],
    ]);
  });

  it('números do mês: o que já aconteceu, transferências e compromissos separados', () => {
    const outubro = analise.meses.find((m) => m.mes === '2026-10');
    expect(outubro?.realizado).toEqual({ receitas: 300000, despesas: 8000, guardado: 0, sobra: 292000 });
    expect(outubro?.transferencias).toEqual({ entraram: 5000, sairam: 0, entreContas: 20000 });
    // a compra no cartão de outubro vence em novembro: pesa lá
    const novembro = analise.meses.find((m) => m.mes === '2026-11');
    expect(novembro?.compromissos.porTipo).toEqual({ conta_fixa: 0, parcela: 0, cartao: 86000 });
    expect(novembro?.livreParaGastar.faturas).toBe(86000);
  });

  it('saldo de cada conta como o app calcula', () => {
    expect(analise.contas.map((c) => [c.nome, c.saldoHoje])).toEqual([
      ['BB · Conta corrente', 10000 + 300000 + 20000 + 5000 - 8000],
      ['BB · Poupança', 50000 - 20000],
    ]);
  });

  it('planilha com sinal no valor', () => {
    const csv = planilhaDaAnalise(analise).split('\r\n');
    expect(csv[0]).toContain('Data;Mês em que pesa;Tipo;Natureza');
    expect(csv[1]).toBe('05/10/2026;2026-10;Movimentação;Receita;Feito;Salário;3000,00;BB · Conta corrente;;;;;manual');
    expect(csv[4]).toContain(';Despesa;Feito;Mercado;-80,00;');
  });
});
