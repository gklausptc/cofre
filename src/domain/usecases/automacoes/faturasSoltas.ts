import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { compromissosDosMeses, PAGAMENTO_DE_FATURA, type DadosParaConciliar, type FaturaAberta } from '@/domain/usecases/importacao/conciliar';
import { dataFechamentoDaFatura } from '@/domain/usecases/mesDaFatura';
import { bancoPorTexto } from '@/domain/usecases/importacao/bancos';
import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import type { PagamentoFatura } from '@/domain/repositories/faturasRepository';

/**
 * Um pagamento de fatura que entrou como gasto comum na conta (o extrato da conta foi
 * importado antes da fatura, ou o banco escreveu "PAGAMENTO DE BOLETO"): ele soma em dobro
 * com as compras da fatura e deixa a fatura "atrasada".
 */
export type PagamentoSolto = {
  movimentacaoId: number;
  descricao: string;
  data: string;
  valor: number;
  cartaoNome: string;
  totalDaFatura: number;
  pagamento: PagamentoFatura;
  parcelaIds: number[];
};

/** Fatura de um mês que já passou, sem pagamento no app. */
export type FaturaAntigaEmAberto = { cartaoNome: string; total: number; pagamento: PagamentoFatura; parcelaIds: number[] };

const BOLETO = /\b(BOLETO|TITULO|PAGTO|PAGAMENTO|PGTO)\b/;
const quaseIgual = (a: number, b: number) => Math.abs(a - b) <= Math.max(100, Math.round(b * 0.01));

function mesesDoUltimoAno(hoje: string): string[] {
  const inicio = parseISO(`${hoje.slice(0, 7)}-01`);
  return Array.from({ length: 15 }, (_, i) => format(addMonths(inicio, i - 13), 'yyyy-MM'));
}

function pagamentoDa(fatura: FaturaAberta, contaBancariaId: number | null, valorPago: number, dataPagamento: string): PagamentoFatura {
  return {
    cartaoId: fatura.cartao.id,
    mesReferencia: fatura.mesReferencia,
    dataFechamento: dataFechamentoDaFatura(fatura.mesReferencia, fatura.cartao),
    dataVencimento: fatura.vencimento,
    contaBancariaId,
    valorPago,
    dataPagamento,
  };
}

/**
 * Saídas da conta que são o pagamento de uma fatura em aberto: mesmo valor (até 1% ou R$ 1)
 * entre 20 dias antes e 10 depois do vencimento, ou o texto de pagamento de fatura/boleto
 * com o banco do cartão. Cada saída e cada fatura casam uma vez só.
 */
export function encontrarPagamentosSoltos(dados: DadosParaConciliar, hoje: string): PagamentoSolto[] {
  const { faturas } = compromissosDosMeses(dados, mesesDoUltimoAno(hoje));
  const abertas = faturas.filter((f) => !f.paga && f.total > 0).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const candidatas = dados.movimentacoes.filter(
    (m) => m.tipo === 'saida' && m.faturaId === null && m.parcelaId === null && (m.origem === 'manual' || m.origem === null)
  );
  const usadas = new Set<number>();
  const achados: PagamentoSolto[] = [];
  for (const fatura of abertas) {
    const bancoDoCartao = bancoPorTexto(fatura.cartao.nome);
    const noPrazo = candidatas.filter((m) => {
      if (usadas.has(m.id)) return false;
      const dias = differenceInCalendarDays(parseISO(m.data), parseISO(fatura.vencimento));
      return dias >= -20 && dias <= 10;
    });
    const nota = (m: (typeof candidatas)[number]) => {
      const texto = semAcentos(m.descricao ?? '');
      const doBanco = bancoDoCartao !== null && bancoPorTexto(texto) === bancoDoCartao;
      const textoDeFatura = PAGAMENTO_DE_FATURA.test(texto) || (BOLETO.test(texto) && doBanco);
      const valor = quaseIgual(m.valor, fatura.total) || quaseIgual(m.valor, fatura.pendente);
      if (!valor && !(textoDeFatura && doBanco)) return -1;
      return (valor ? 2 : 0) + (textoDeFatura ? 1 : 0) + (doBanco ? 1 : 0);
    };
    const melhor = noPrazo
      .map((m) => ({ m, nota: nota(m) }))
      .filter((x) => x.nota >= 2)
      .sort(
        (a, b) =>
          b.nota - a.nota ||
          Math.abs(differenceInCalendarDays(parseISO(a.m.data), parseISO(fatura.vencimento))) -
            Math.abs(differenceInCalendarDays(parseISO(b.m.data), parseISO(fatura.vencimento)))
      )[0];
    if (!melhor) continue;
    usadas.add(melhor.m.id);
    achados.push({
      movimentacaoId: melhor.m.id,
      descricao: melhor.m.descricao ?? 'Pagamento',
      data: melhor.m.data,
      valor: melhor.m.valor,
      cartaoNome: fatura.cartao.nome,
      totalDaFatura: fatura.total,
      pagamento: pagamentoDa(fatura, melhor.m.contaBancariaId, melhor.m.valor, melhor.m.data),
      parcelaIds: fatura.parcelaIds,
    });
  }
  return achados;
}

/**
 * Faturas que venceram há mais de 15 dias e continuam sem pagamento no app (comum depois de
 * importar faturas antigas sem o extrato da conta que as pagou). Não inclui as que têm um
 * pagamento solto (essas se resolvem ligando o pagamento).
 */
export function faturasAntigasEmAberto(dados: DadosParaConciliar, hoje: string, soltos: PagamentoSolto[]): FaturaAntigaEmAberto[] {
  const { faturas } = compromissosDosMeses(dados, mesesDoUltimoAno(hoje));
  const comPagamento = new Set(soltos.map((s) => `${s.pagamento.cartaoId}-${s.pagamento.mesReferencia}`));
  return faturas
    .filter(
      (f) =>
        !f.paga &&
        f.pendente > 0 &&
        differenceInCalendarDays(parseISO(hoje), parseISO(f.vencimento)) > 15 &&
        !comPagamento.has(`${f.cartao.id}-${f.mesReferencia}`)
    )
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map((f) => ({ cartaoNome: f.cartao.nome, total: f.pendente, pagamento: pagamentoDa(f, null, f.pendente, f.vencimento), parcelaIds: f.parcelaIds }));
}
