import { addMonths, format, parseISO } from 'date-fns';
import type { Cartao, CompraParcelada, NovaParcela } from '@/domain/types/entities';

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function primeiroMesReferencia(dataCompra: Date, diaFechamento: number): Date {
  return dataCompra.getDate() > diaFechamento ? addMonths(dataCompra, 1) : dataCompra;
}

/**
 * Cria N parcelas para uma compra parcelada. O valor é dividido igualmente entre
 * as parcelas, ajustando centavos na última para bater exatamente o total.
 */
export function gerarParcelas(
  compra: Pick<CompraParcelada, 'id' | 'valorTotal' | 'numParcelas' | 'dataCompra'>,
  cartao: Pick<Cartao, 'diaFechamento'>,
  /** Mês de fechamento da fatura da 1ª parcela ('YYYY-MM'); por padrão vem da data da compra. */
  mesPrimeiraParcela?: string
): Omit<NovaParcela, 'id'>[] {
  const valorBase = arredondar(compra.valorTotal / compra.numParcelas);
  const somaAntesDaUltima = arredondar(valorBase * (compra.numParcelas - 1));
  const valorUltima = arredondar(compra.valorTotal - somaAntesDaUltima);

  const mesInicial = mesPrimeiraParcela
    ? parseISO(`${mesPrimeiraParcela}-01`)
    : primeiroMesReferencia(parseISO(compra.dataCompra), cartao.diaFechamento);

  return Array.from({ length: compra.numParcelas }, (_, i) => ({
    compraParceladaId: compra.id,
    contaFixaId: null,
    numero: i + 1,
    valor: i === compra.numParcelas - 1 ? valorUltima : valorBase,
    mesReferencia: format(addMonths(mesInicial, i), 'yyyy-MM'),
    faturaId: null,
    status: 'pendente' as const,
    dataPagamento: null,
  }));
}
