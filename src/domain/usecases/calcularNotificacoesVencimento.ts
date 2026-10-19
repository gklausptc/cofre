import { subDays } from 'date-fns';
import { formatarMoeda } from '@/core/utils/currency';
import type { Cartao, CompraParcelada, ContaFixa, Parcela } from '@/domain/types/entities';
import { mesAtualIso } from '@/core/utils/date';
import { mesVencimentoDaFatura } from '@/domain/usecases/mesDaFatura';

export type ItemNotificacao = {
  identificador: string;
  titulo: string;
  corpo: string;
  data: Date;
};

function dataDoVencimento(mesReferencia: string, dia: number): Date {
  const [ano, mes] = mesReferencia.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 9, 0, 0);
}

/**
 * Lembretes de vencimento: 1 dia antes de cada parcela pendente (conta fixa ou
 * cartão) e do fechamento de cartões com compras ativas no mês.
 */
export function calcularNotificacoesVencimento(
  contasFixas: ContaFixa[],
  cartoes: Cartao[],
  comprasParceladas: CompraParcelada[],
  parcelasPendentes: Parcela[]
): ItemNotificacao[] {
  const itens: ItemNotificacao[] = [];

  for (const parcela of parcelasPendentes) {
    if (parcela.contaFixaId !== null) {
      const contaFixa = contasFixas.find((c) => c.id === parcela.contaFixaId);
      if (!contaFixa) continue;
      const vencimento = dataDoVencimento(parcela.mesReferencia, contaFixa.diaVencimento);
      itens.push({
        identificador: `conta-fixa-${parcela.id}`,
        titulo: `${contaFixa.nome} vence amanhã`,
        corpo: `${formatarMoeda(parcela.valor)} · dia ${contaFixa.diaVencimento}`,
        data: subDays(vencimento, 1),
      });
    } else if (parcela.compraParceladaId !== null) {
      const compra = comprasParceladas.find((c) => c.id === parcela.compraParceladaId);
      if (!compra) continue;
      const cartao = cartoes.find((c) => c.id === compra.cartaoId);
      if (!cartao) continue;
      // mesReferencia da parcela é o mês de fechamento; a fatura pode vencer no mês seguinte
      const vencimento = dataDoVencimento(mesVencimentoDaFatura(parcela.mesReferencia, cartao), cartao.diaVencimento);
      itens.push({
        identificador: `parcela-cartao-${parcela.id}`,
        titulo: `Fatura do ${cartao.nome} vence amanhã`,
        corpo: `Parcela ${parcela.numero} de "${compra.descricao}" · ${formatarMoeda(parcela.valor)}`,
        data: subDays(vencimento, 1),
      });
    }
  }

  const mesAtual = mesAtualIso();
  for (const cartao of cartoes) {
    const temCompraAtiva = comprasParceladas.some((c) => c.cartaoId === cartao.id && c.ativo);
    if (!temCompraAtiva) continue;
    const fechamento = dataDoVencimento(mesAtual, cartao.diaFechamento);
    itens.push({
      identificador: `fechamento-cartao-${cartao.id}-${mesAtual}`,
      titulo: `${cartao.nome} fecha amanhã`,
      corpo: 'Confira as compras do mês antes do fechamento da fatura.',
      data: subDays(fechamento, 1),
    });
  }

  return itens;
}
