import { addDays, format, parseISO } from 'date-fns';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';
import type { ContaBancaria, Fatura } from '@/domain/types/entities';

export type DiaNegativo = { contaBancariaId: number; nomeConta: string; data: string; saldo: number };

/**
 * Saldo de cada conta dia a dia, de hoje até `dias` à frente, a partir do saldo de hoje e do
 * que ainda vai sair ou entrar: contas fixas não pagas (pela conta delas), faturas (pela conta
 * que pagou a última fatura daquele cartão) e entradas previstas. Devolve o primeiro dia em
 * que cada conta fica negativa.
 */
export function primeiroDiaNegativo(params: {
  contas: Pick<ContaBancaria, 'id' | 'nomeConta' | 'ativo'>[];
  saldos: Map<number, number>;
  lancamentos: Pick<LancamentoDoPeriodo, 'tipo' | 'natureza' | 'status' | 'data' | 'valor' | 'contaBancariaId' | 'cartaoId' | 'noCartao'>[];
  faturas: Pick<Fatura, 'cartaoId' | 'contaBancariaId' | 'dataPagamento' | 'status'>[];
  hoje: string;
  dias?: number;
}): DiaNegativo[] {
  const { contas, saldos, lancamentos, hoje } = params;
  const fim = format(addDays(parseISO(hoje), params.dias ?? 45), 'yyyy-MM-dd');

  const contaQuePagaCartao = new Map<number, number>();
  for (const f of [...params.faturas].filter((x) => x.status === 'paga' && x.contaBancariaId !== null).sort((a, b) => (a.dataPagamento ?? '').localeCompare(b.dataPagamento ?? ''))) {
    if (f.contaBancariaId !== null) contaQuePagaCartao.set(f.cartaoId, f.contaBancariaId);
  }

  const efeitos = new Map<number, { data: string; valor: number }[]>();
  const somar = (contaId: number | null, data: string, valor: number) => {
    if (contaId === null) return;
    efeitos.set(contaId, [...(efeitos.get(contaId) ?? []), { data, valor }]);
  };
  for (const l of lancamentos) {
    if (l.status === 'pago' || l.data > fim) continue;
    // atrasado ainda vai sair: conta a partir de hoje
    const data = l.data < hoje ? hoje : l.data;
    if (l.tipo === 'conta_fixa' && l.natureza === 'despesa' && !l.noCartao) somar(l.contaBancariaId, data, -l.valor);
    else if (l.natureza === 'fatura' && l.cartaoId !== null) somar(contaQuePagaCartao.get(l.cartaoId) ?? null, data, -l.valor);
    else if (l.natureza === 'receita' && l.data > hoje) somar(l.contaBancariaId, data, l.valor);
  }

  const resultado: DiaNegativo[] = [];
  for (const conta of contas) {
    if (conta.ativo === false) continue;
    let saldo = saldos.get(conta.id) ?? 0;
    // no mesmo dia, entradas antes das saídas
    const doDia = [...(efeitos.get(conta.id) ?? [])].sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);
    if (saldo < 0) {
      resultado.push({ contaBancariaId: conta.id, nomeConta: conta.nomeConta, data: hoje, saldo });
      continue;
    }
    for (const e of doDia) {
      saldo += e.valor;
      if (saldo < 0) {
        resultado.push({ contaBancariaId: conta.id, nomeConta: conta.nomeConta, data: e.data, saldo });
        break;
      }
    }
  }
  return resultado.sort((a, b) => a.data.localeCompare(b.data));
}
