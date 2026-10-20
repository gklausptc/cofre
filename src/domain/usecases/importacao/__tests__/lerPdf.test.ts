import { describe, expect, it } from '@jest/globals';
import { lerExtratoDoPdf, type LinhaDePdf } from '@/domain/usecases/importacao/lerPdf';
import { contaDoTexto, identificadorDoExtrato, nomeDaContaNova, titularDoTexto } from '@/domain/usecases/importacao/dadosDoArquivo';

/** Linha como o leitor de PDF devolve: pedaços com a posição x. */
function linha(y: number, ...pedacos: [number, string][]): LinhaDePdf {
  return { y, texto: pedacos.map(([, t]) => t).join(' '), pedacos: pedacos.map(([x, texto]) => ({ x, texto })) };
}

// extrato no layout do BB (dados inventados): a descrição fica centralizada na célula,
// uma linha acima e uma abaixo da linha da data e do valor
const extratoBB: LinhaDePdf[][] = [
  [
    linha(802, [25, 'Extrato de Conta Corrente']),
    linha(783, [25, 'Cliente:'], [65, 'MARIA S OLIVEIRA']),
    linha(767, [20, 'Período: 01 a 31/10/2026'], [220, 'Agência: 1234-5 Conta: 99887-6']),
    linha(740, [30, 'Lançamentos']),
    linha(725, [30, 'Dia'], [99, 'Lote'], [148, 'Documento'], [265, 'Histórico'], [550, 'Valor']),
    linha(710, [30, '30/09/2026'], [265, 'Saldo Anterior'], [521, '500,00 (+)']),
    linha(696, [265, 'Compra com Cartão']),
    linha(690, [30, '01/10/2026'], [99, '99008'], [148, '178406'], [532, '100,00 (-)']),
    linha(685, [265, '01/10 21:46 POSTO EXEMPLO']),
    linha(672, [265, 'Pix - Recebido']),
    linha(666, [30, '02/10/2026'], [99, '13105'], [148, '100101'], [529, '1.250,00 (+)']),
    linha(661, [265, '02/10 07:01 EMPRESA EXEMPLO LTDA']),
    linha(650, [30, '02/10/2026'], [99, '99020'], [265, 'Saldo do dia'], [529, '1.650,00 (+)']),
    linha(637, [265, 'Pix - Enviado']),
    linha(631, [30, '03/10/2026'], [99, '13105'], [148, '100102'], [265, '03/10 13:08 MERCADO DE'], [537, '25,34 (-)']),
    linha(620, [265, 'CARNES CENTRAL']),
    linha(30, [30, 'Página 1 de 1']),
  ],
];

describe('lerExtratoDoPdf: extrato de conta (layout do BB)', () => {
  const extrato = lerExtratoDoPdf(extratoBB, 'Extrato conta corrente - 102026.pdf');

  it('junta a descrição de várias linhas, lê o sinal e pula os saldos', () => {
    expect(extrato).not.toBeNull();
    expect(extrato?.transacoes.map((t) => [t.data, t.valor, t.descricao])).toEqual([
      ['2026-10-01', -10000, 'Compra com Cartão 01/10 21:46 POSTO EXEMPLO'],
      ['2026-10-02', 125000, 'Pix - Recebido 02/10 07:01 EMPRESA EXEMPLO LTDA'],
      ['2026-10-03', -2534, 'Pix - Enviado 03/10 13:08 MERCADO DE CARNES CENTRAL'],
    ]);
  });

  it('guarda banco, titular, conta e saldo anterior', () => {
    expect(extrato).toMatchObject({
      formato: 'pdf',
      banco: 'bb',
      origem: 'conta',
      titular: 'MARIA S OLIVEIRA',
      conta: { agencia: '1234-5', numero: '99887-6', tipo: 'corrente' },
      saldoAnterior: 50000,
      periodo: { inicio: '2026-10-01', fim: '2026-10-03' },
    });
    expect(extrato?.transacoes.every((t) => t.idExterno.startsWith('h:bb:'))).toBe(true);
  });
});

describe('lerExtratoDoPdf: fatura de cartão', () => {
  const fatura: LinhaDePdf[][] = [
    [
      linha(790, [60, 'Olá, JOAO DA SILVA! Sua fatura com vencimento em Novembro chegou.']),
      linha(770, [60, 'Vencimento: 10 de Novembro'], [300, 'Limite total: R$ 5.000,00']),
      linha(750, [60, 'Compras e pagamentos feitos até o fechamento desta fatura em 03/11/26.']),
      linha(740, [60, 'Cartão Platinum']),
      linha(700, [40, '05 out'], [100, 'PADARIA DO BAIRRO'], [500, '23,90']),
      linha(680, [40, '28 dez'], [100, 'LOJA X - Parcela 2/10'], [500, '150,00']),
      linha(660, [40, '15 out'], [100, 'Inclusao de Pagamento'], [500, '980,00']),
      linha(640, [40, 'Total a pagar'], [500, 'R$ 1.153,90']),
    ],
  ];
  const extrato = lerExtratoDoPdf(fatura, 'Fatura_10-11-2026.pdf');

  it('compra é positiva, pagamento negativo, ano vem do vencimento', () => {
    expect(extrato?.origem).toBe('cartao');
    expect(extrato?.vencimentoFatura).toBe('2026-11-10');
    expect(extrato?.transacoes.map((t) => [t.data, t.valor, t.descricao])).toEqual([
      ['2026-10-05', 2390, 'PADARIA DO BAIRRO'],
      ['2025-12-28', 15000, 'LOJA X - Parcela 2/10'],
      ['2026-10-15', -98000, 'Inclusao de Pagamento'],
    ]);
    expect(extrato?.cartao).toEqual({ nome: 'Platinum', limite: 500000, diaFechamento: 3, diaVencimento: 10 });
  });

  it('PDF sem tabela de lançamentos não vira extrato', () => {
    expect(lerExtratoDoPdf([[linha(700, [60, 'Sua fatura fechou com saldo positivo']), linha(680, [60, 'Total a pagar R$ 0,00'])]], 'f.pdf')).toBeNull();
  });
});

describe('dados do cabeçalho', () => {
  it('titular, conta e identificador', () => {
    expect(titularDoTexto(['"Cliente:";"JOSE DA SILVA"'])).toBe('JOSE DA SILVA');
    expect(titularDoTexto(['Titular - 12.345.678 ANA PAULA SOUZA'])).toBe('ANA PAULA SOUZA');
    expect(titularDoTexto(['Nome no Cartão;JOSE'])).toBeNull();
    expect(contaDoTexto(['Extrato de Poupança', 'Agência: 0001 Conta: 12.345-6'], 'x.pdf')).toEqual({ agencia: '0001', numero: '12345-6', tipo: 'poupanca' });
    expect(contaDoTexto([], 'extrato_poupanca_2026.csv')).toEqual({ agencia: null, numero: null, tipo: 'poupanca' });
    expect(identificadorDoExtrato({ banco: 'bb', conta: { agencia: '1234-5', numero: '09988-7', tipo: 'corrente' } })).toBe('bb|12345|99887|corrente');
    expect(identificadorDoExtrato({ banco: 'bb', conta: { agencia: null, numero: null, tipo: 'poupanca' } })).toBeNull();
    expect(nomeDaContaNova('bb', 'Banco do Brasil', { agencia: '1', numero: '99887-6', tipo: 'poupanca' })).toBe('Banco do Brasil · Poupança 9887');
  });
});
