import { addMonths, differenceInCalendarMonths, format, parseISO } from 'date-fns';
import type { ContaFixa, NovaParcela, Parcela } from '@/domain/types/entities';

const OCORRENCIAS_POR_MES: Record<Exclude<ContaFixa['recorrencia'], 'unica'>, number> = {
  mensal: 1,
  quinzenal: 2,
  semanal: 4,
  anual: 1,
};

function mesReferenciaDe(data: Date | string): string {
  const d = typeof data === 'string' ? parseISO(data) : data;
  return format(d, 'yyyy-MM');
}

/**
 * Gera as próximas ocorrências (como registros de `parcelas`) para cada conta fixa
 * ativa, cobrindo os próximos 3 meses a partir de `hoje`. Não duplica ocorrências
 * já existentes. Recorrências quinzenal/semanal geram múltiplas parcelas no mesmo
 * mês (o schema não guarda a data exata de vencimento por parcela, só o mês).
 */
export function gerarRecorrencia(
  contasFixas: ContaFixa[],
  parcelasExistentes: Parcela[],
  hoje: Date = new Date()
): Omit<NovaParcela, 'id'>[] {
  const novas: Omit<NovaParcela, 'id'>[] = [];
  const mesesJanela = [0, 1, 2].map((i) => mesReferenciaDe(addMonths(hoje, i)));

  for (const contaFixa of contasFixas) {
    if (!contaFixa.ativo) continue;
    const mesFim = contaFixa.dataFim ? mesReferenciaDe(contaFixa.dataFim) : null;
    const parcelasDaConta = parcelasExistentes.filter((p) => p.contaFixaId === contaFixa.id);

    if (contaFixa.recorrencia === 'unica') {
      if (parcelasDaConta.length === 0) {
        novas.push({
          contaFixaId: contaFixa.id,
          compraParceladaId: null,
          numero: 1,
          valor: contaFixa.valor,
          mesReferencia: mesReferenciaDe(contaFixa.dataInicio),
          faturaId: null,
          status: 'pendente',
          dataPagamento: null,
        });
      }
      continue;
    }

    const ocorrenciasPorMes = OCORRENCIAS_POR_MES[contaFixa.recorrencia];

    for (const mes of mesesJanela) {
      if (mesFim && mes > mesFim) continue;
      if (mes < mesReferenciaDe(contaFixa.dataInicio)) continue;
      if (
        contaFixa.recorrencia === 'anual' &&
        format(parseISO(`${mes}-01`), 'MM') !== format(parseISO(contaFixa.dataInicio), 'MM')
      ) {
        continue;
      }

      const existentesNoMes = parcelasDaConta.filter((p) => p.mesReferencia === mes).length;
      const faltam = ocorrenciasPorMes - existentesNoMes;

      // Conta com fim definido (ex.: financiamento em 48x) numera pela sequência de meses
      const parcelada = contaFixa.recorrencia === 'mensal' && mesFim !== null;
      const numeroDoMes = parcelada
        ? differenceInCalendarMonths(parseISO(`${mes}-01`), parseISO(`${mesReferenciaDe(contaFixa.dataInicio)}-01`)) + 1
        : null;

      for (let i = 0; i < faltam; i++) {
        novas.push({
          contaFixaId: contaFixa.id,
          compraParceladaId: null,
          numero: numeroDoMes ?? existentesNoMes + i + 1,
          valor: contaFixa.valor,
          mesReferencia: mes,
          faturaId: null,
          status: 'pendente',
          dataPagamento: null,
        });
      }
    }
  }

  return novas;
}
