import { addMonths, format, parseISO } from 'date-fns';
import { dividirEmParcelas, formatarMoeda } from '@/core/utils/currency';
import type { CompraParcelada, NovaParcela, Parcela } from '@/domain/types/entities';

export type PlanoEdicaoParcelamento = {
  atualizar: { id: number; numero: number; valor: number; mesReferencia: string }[];
  remover: number[];
  criar: Omit<NovaParcela, 'id'>[];
};

export type ResultadoEdicaoParcelamento =
  | { ok: true; plano: PlanoEdicaoParcelamento }
  | { ok: false; erro: string };

/**
 * Recalcula o parcelamento de uma compra já existente. Parcelas pagas nunca são
 * alteradas: o que sobra do valor total (total - já pago) é dividido entre as
 * parcelas pendentes, com os centavos ajustados na última. Se o número de parcelas
 * mudou, pendentes sobrando são removidas e as que faltam são criadas nos meses
 * seguintes.
 */
export function editarParcelamento(
  compra: Pick<CompraParcelada, 'id'>,
  parcelasDaCompra: Parcela[],
  novos: { valorTotal: number; numParcelas: number; mesPrimeiraParcela: string }
): ResultadoEdicaoParcelamento {
  const { valorTotal, numParcelas, mesPrimeiraParcela } = novos;
  const pagas = parcelasDaCompra.filter((p) => p.status === 'paga');
  const pendentes = parcelasDaCompra
    .filter((p) => p.status !== 'paga')
    .sort((a, b) => a.numero - b.numero);

  const totalPago = pagas.reduce((soma, p) => soma + p.valor, 0);
  const restante = valorTotal - totalPago;
  const qtdPendentes = numParcelas - pagas.length;

  if (qtdPendentes < 1) {
    return {
      ok: false,
      erro: `${pagas.length} parcela(s) já paga(s): o número de parcelas precisa ser maior que isso.`,
    };
  }
  if (restante <= 0) {
    return {
      ok: false,
      erro: `O valor total precisa ser maior que o já pago (${formatarMoeda(totalPago)}).`,
    };
  }

  // Números livres (1..N menos os das parcelas pagas), em ordem, para as pendentes
  const numerosPagos = new Set(pagas.map((p) => p.numero));
  const numerosLivres = Array.from({ length: numParcelas }, (_, i) => i + 1)
    .filter((n) => !numerosPagos.has(n))
    .slice(0, qtdPendentes);

  // Mês (de fechamento da fatura) da parcela 1; as demais seguem mês a mês
  const mesBase = parseISO(`${mesPrimeiraParcela}-01`);
  const mesDoNumero = (numero: number) => format(addMonths(mesBase, numero - 1), 'yyyy-MM');

  const valores = dividirEmParcelas(restante, qtdPendentes);
  const valorDaPosicao = (i: number) => valores[i];

  const atualizar: PlanoEdicaoParcelamento['atualizar'] = [];
  const criar: PlanoEdicaoParcelamento['criar'] = [];

  numerosLivres.forEach((numero, i) => {
    const existente = pendentes[i];
    const mesReferencia = mesDoNumero(numero);
    if (existente) {
      atualizar.push({ id: existente.id, numero, valor: valorDaPosicao(i), mesReferencia });
    } else {
      criar.push({
        compraParceladaId: compra.id,
        contaFixaId: null,
        numero,
        valor: valorDaPosicao(i),
        mesReferencia,
        faturaId: null,
        status: 'pendente',
        dataPagamento: null,
      });
    }
  });

  const remover = pendentes.slice(qtdPendentes).map((p) => p.id);

  return { ok: true, plano: { atualizar, remover, criar } };
}
