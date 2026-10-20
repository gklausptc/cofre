import { describe, expect, it } from '@jest/globals';
import {
  formatarCampoCSV,
  formatarValorCSV,
  gerarExtratoCartaoCSV,
  gerarExtratoContaCSV,
  montarCSV,
} from '@/domain/usecases/gerarExtratoCSV';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { umaFatura } from '@/test/fabricas';
import {
  contaPrincipal,
  contaSecundaria,
  gastosDoCenario,
  movimentacoesDoCenario,
} from '@/test/cenarioConta';
import { gastosDoMes, luz, nubank, parcelasDoMes, streaming, tv } from '@/test/cenarioMes';

const BOM = String.fromCharCode(0xfeff);
const semCategorias = new Map<number, { nome: string }>();

/** Linhas do CSV (sem o cabeçalho), já separadas em campos. */
function linhasDoCSV(csv: string): string[][] {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv
    .slice(1)
    .split('\r\n')
    .filter((linha) => linha.length > 0)
    .slice(1)
    .map((linha) => linha.split(';'));
}

const outrosDoCenario = { gastos: gastosDoCenario };

describe('formatação CSV', () => {
  it('põe aspas só quando precisa', () => {
    expect(formatarCampoCSV('simples')).toBe('simples');
    expect(formatarCampoCSV('a;b')).toBe('"a;b"');
    expect(formatarCampoCSV('diz "oi"')).toBe('"diz ""oi"""');
  });

  it('centavos viram valor com vírgula decimal e duas casas', () => {
    expect(formatarValorCSV(123450)).toBe('1234,50');
    expect(formatarValorCSV(-1000)).toBe('-10,00');
  });

  it('começa com BOM, separa com ; e termina cada linha com CRLF', () => {
    expect(
      montarCSV([
        ['a', 'b'],
        ['1', '2'],
      ])
    ).toBe(`${BOM}a;b\r\n1;2\r\n`);
  });
});

describe('gerarExtratoContaCSV', () => {
  it('inclui tudo que mexe no saldo (pagamentos com rótulo próprio), em ordem de data, com o saldo acumulado', () => {
    const csv = gerarExtratoContaCSV(contaPrincipal, movimentacoesDoCenario, semCategorias, null, outrosDoCenario);

    expect(linhasDoCSV(csv)).toEqual([
      ['05/03/2026', 'entrada', 'Salário', '', '500,00', '1500,00'],
      ['10/03/2026', 'saída', 'Aluguel', '', '-200,00', '1300,00'],
      ['12/03/2026', 'transferência enviada', '', '', '-100,00', '1200,00'],
      ['15/03/2026', 'saída', 'Padaria', '', '-30,00', '1170,00'],
      ['20/03/2026', 'conta fixa paga', 'Internet', '', '-70,00', '1100,00'],
      ['01/04/2026', 'saída', 'Gasto rápido', '', '-20,00', '1080,00'],
      ['02/04/2026', 'transferência recebida', '', '', '50,00', '1130,00'],
      ['05/04/2026', 'pagamento de fatura', 'Fatura Nubank', '', '-300,00', '830,00'],
    ]);
  });

  it('o último saldo_apos bate com calcularSaldoConta nas duas contas', () => {
    for (const conta of [contaPrincipal, contaSecundaria]) {
      const linhas = linhasDoCSV(gerarExtratoContaCSV(conta, movimentacoesDoCenario, semCategorias, null, outrosDoCenario));
      const saldo = calcularSaldoConta(conta, movimentacoesDoCenario, gastosDoCenario);
      expect(linhas[linhas.length - 1][5]).toBe(formatarValorCSV(saldo));
    }
  });

  it('com período, mostra só o mês mas o saldo continua do histórico', () => {
    const csv = gerarExtratoContaCSV(contaPrincipal, movimentacoesDoCenario, semCategorias, '2026-04', outrosDoCenario);

    expect(linhasDoCSV(csv).map((l) => [l[0], l[5]])).toEqual([
      ['01/04/2026', '1080,00'],
      ['02/04/2026', '1130,00'],
      ['05/04/2026', '830,00'],
    ]);
  });

  it('mostra o nome da categoria', () => {
    const categorias = new Map([[7, { nome: 'Moradia' }]]);
    const movs = [{ ...movimentacoesDoCenario[1], categoriaId: 7 }];
    expect(linhasDoCSV(gerarExtratoContaCSV(contaPrincipal, movs, categorias, null))[0][3]).toBe('Moradia');
  });
});

describe('gerarExtratoCartaoCSV', () => {
  it('lista o que é cobrado na fatura do mês e fecha com o total', () => {
    const csv = gerarExtratoCartaoCSV(nubank, gastosDoMes, parcelasDoMes, [tv], [luz, streaming], semCategorias, '2026-04');

    expect(linhasDoCSV(csv)).toEqual([
      ['01/01/2026', 'TV', '3/10', '', '300,00', 'pendente'],
      ['28/02/2026', 'Streaming', '', '', '50,00', 'pendente'],
      ['10/03/2026', 'Mercado', '', '', '60,00', 'pendente'],
      ['20/03/2026', 'iFood', '', '', '40,00', 'pendente'],
      ['', 'TOTAL', '', '', '450,00', ''],
    ]);
  });

  it('fatura paga marca as compras à vista como pagas', () => {
    const paga = umaFatura({ cartaoId: 1, mesReferencia: '2026-04', status: 'paga' });
    const linhas = linhasDoCSV(
      gerarExtratoCartaoCSV(nubank, gastosDoMes, parcelasDoMes, [tv], [luz, streaming], semCategorias, '2026-04', [paga])
    );

    expect(linhas.filter((l) => l[1] === 'Mercado' || l[1] === 'iFood').map((l) => l[5])).toEqual(['paga', 'paga']);
  });
});
