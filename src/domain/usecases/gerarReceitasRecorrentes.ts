import { format, getDaysInMonth, parseISO } from 'date-fns';
import type { Movimentacao, NovaMovimentacao } from '@/domain/types/entities';

function mesReferenciaDe(data: Date | string): string {
  const d = typeof data === 'string' ? parseISO(data) : data;
  return format(d, 'yyyy-MM');
}

/**
 * Gera a cópia do mês atual de cada entrada marcada como recorrente (ex.: salário),
 * caso ainda não exista uma para o mês. A movimentação original marcada `recorrente`
 * é o "modelo" — as cópias apontam pra ela via `recorrenteOrigemId` e nunca duplicam
 * entre si. Roda ao abrir o app, olhando só o mês atual (diferente de
 * `gerarRecorrencia`, que antecipa os próximos 3 meses de contas fixas, porque aqui
 * não faz sentido lançar um salário que ainda não caiu).
 */
export function gerarReceitasRecorrentes(
  movimentacoes: Movimentacao[],
  hoje: Date = new Date()
): Omit<NovaMovimentacao, 'id'>[] {
  const mesAtual = mesReferenciaDe(hoje);
  const novas: Omit<NovaMovimentacao, 'id'>[] = [];

  const modelos = movimentacoes.filter(
    (m) => m.tipo === 'entrada' && m.recorrente && m.recorrenteOrigemId === null
  );

  for (const modelo of modelos) {
    const jaExisteNoMes = movimentacoes.some(
      (m) => m.data.startsWith(mesAtual) && (m.id === modelo.id || m.recorrenteOrigemId === modelo.id)
    );
    if (jaExisteNoMes) continue;

    const diaOriginal = Number(format(parseISO(modelo.data), 'd'));
    const diasNoMes = getDaysInMonth(hoje);
    const dia = Math.min(diaOriginal, diasNoMes);
    const data = `${mesAtual}-${String(dia).padStart(2, '0')}`;

    novas.push({
      contaBancariaId: modelo.contaBancariaId,
      tipo: 'entrada',
      valor: modelo.valor,
      data,
      descricao: modelo.descricao,
      categoriaId: modelo.categoriaId,
      contaDestinoId: null,
      origem: 'manual',
      membroId: modelo.membroId,
      reservarProximoMes: modelo.reservarProximoMes,
      recorrente: false,
      recorrenteOrigemId: modelo.id,
    });
  }

  return novas;
}
