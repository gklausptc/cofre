import { addMonths, format, parseISO } from 'date-fns';
import { dividirEmParcelas } from '@/core/utils/currency';
import type { Cartao, CompraParcelada, NovaParcela } from '@/domain/types/entities';

function primeiroMesReferencia(dataCompra: Date, diaFechamento: number): Date {
  return dataCompra.getDate() > diaFechamento ? addMonths(dataCompra, 1) : dataCompra;
}

/**
 * Cria N parcelas para uma compra parcelada. O valor (em centavos) é dividido igualmente
 * entre as parcelas, e o resto da divisão vai para a última para bater exatamente o total.
 */
export function gerarParcelas(
  compra: Pick<CompraParcelada, 'id' | 'valorTotal' | 'numParcelas' | 'dataCompra'>,
  cartao: Pick<Cartao, 'diaFechamento'>,
  /** Mês de fechamento da fatura da 1ª parcela ('YYYY-MM'); por padrão vem da data da compra. */
  mesPrimeiraParcela?: string
): Omit<NovaParcela, 'id'>[] {
  const valores = dividirEmParcelas(compra.valorTotal, compra.numParcelas);

  const mesInicial = mesPrimeiraParcela
    ? parseISO(`${mesPrimeiraParcela}-01`)
    : primeiroMesReferencia(parseISO(compra.dataCompra), cartao.diaFechamento);

  return Array.from({ length: compra.numParcelas }, (_, i) => ({
    compraParceladaId: compra.id,
    contaFixaId: null,
    numero: i + 1,
    valor: valores[i],
    mesReferencia: format(addMonths(mesInicial, i), 'yyyy-MM'),
    faturaId: null,
    status: 'pendente' as const,
    dataPagamento: null,
  }));
}
