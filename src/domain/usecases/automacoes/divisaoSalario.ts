import { differenceInCalendarDays, parseISO } from 'date-fns';
import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import type { Categoria, Movimentacao } from '@/domain/types/entities';

/** Percentuais (inteiros) do salário a separar. */
export type DivisaoDoSalario = { ativo: boolean; reservaPct: number; cofrinhosPct: number };

export const DIVISAO_PADRAO: DivisaoDoSalario = { ativo: true, reservaPct: 10, cofrinhosPct: 5 };

export function lerDivisao(json: string | null): DivisaoDoSalario {
  if (!json) return DIVISAO_PADRAO;
  try {
    const salvo = JSON.parse(json) as Partial<DivisaoDoSalario>;
    const pct = (v: unknown, padrao: number) => (typeof v === 'number' && v >= 0 && v <= 100 ? Math.round(v) : padrao);
    return {
      ativo: typeof salvo.ativo === 'boolean' ? salvo.ativo : DIVISAO_PADRAO.ativo,
      reservaPct: pct(salvo.reservaPct, DIVISAO_PADRAO.reservaPct),
      cofrinhosPct: pct(salvo.cofrinhosPct, DIVISAO_PADRAO.cofrinhosPct),
    };
  } catch {
    return DIVISAO_PADRAO;
  }
}

export function lerIds(json: string | null): number[] {
  if (!json) return [];
  try {
    const lista = JSON.parse(json) as unknown;
    return Array.isArray(lista) ? lista.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

export const DIAS_PARA_SUGERIR = 7;

/**
 * A entrada de salário mais recente dos últimos 7 dias que ainda não foi dividida (nem
 * dispensada). Salário = categoria "Salário".
 */
export function salarioParaDividir(
  movimentacoes: Pick<Movimentacao, 'id' | 'tipo' | 'categoriaId' | 'data' | 'valor'>[],
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[],
  jaTratados: number[],
  hoje: string
): Pick<Movimentacao, 'id' | 'data' | 'valor'> | null {
  const salario = categorias.find((c) => c.tipo === 'receita' && semAcentos(c.nome) === 'SALARIO');
  if (!salario) return null;
  const candidatos = movimentacoes
    .filter((m) => m.tipo === 'entrada' && m.categoriaId === salario.id && !jaTratados.includes(m.id) && m.data <= hoje)
    .filter((m) => differenceInCalendarDays(parseISO(hoje), parseISO(m.data)) < DIAS_PARA_SUGERIR)
    .sort((a, b) => b.data.localeCompare(a.data));
  return candidatos[0] ?? null;
}

export type CofrinhoParaDivisao = { id: number; nome: string; falta: number; aporteSugerido: number | null };

export type SugestaoDeDivisao = {
  reserva: number;
  cofrinhos: { cofrinhoId: number; nome: string; valor: number }[];
  total: number;
  /** Percentuais efetivos (depois do teto do "Livre para gastar"). */
  reservaPct: number;
  cofrinhosPct: number;
};

/**
 * Quanto separar do salário: X% para a reserva (só enquanto ela não chega na meta) e Y% para
 * os cofrinhos ativos, dividido pelo aporte sugerido de cada um (ou por igual). Nunca deixa o
 * "Livre para gastar" negativo: se deixaria, a sugestão inteira diminui na mesma proporção, e
 * nenhum cofrinho recebe mais do que falta para a meta.
 */
export function sugerirDivisao(params: {
  salario: number;
  config: DivisaoDoSalario;
  reserva: { valorAtual: number; valorMeta: number } | null;
  cofrinhos: CofrinhoParaDivisao[];
  livreParaGastar: number;
}): SugestaoDeDivisao | null {
  const { salario, config, reserva, livreParaGastar } = params;
  if (!config.ativo || salario <= 0) return null;
  const faltaReserva = reserva ? Math.max(0, reserva.valorMeta - reserva.valorAtual) : 0;
  let paraReserva = reserva && faltaReserva > 0 ? Math.min(faltaReserva, Math.round((salario * config.reservaPct) / 100)) : 0;

  const ativos = params.cofrinhos.filter((c) => c.falta > 0);
  let paraCofrinhos = ativos.length > 0 ? Math.round((salario * config.cofrinhosPct) / 100) : 0;

  const teto = Math.max(0, livreParaGastar);
  const pedido = paraReserva + paraCofrinhos;
  if (pedido > teto && pedido > 0) {
    const fator = teto / pedido;
    paraReserva = Math.floor(paraReserva * fator);
    paraCofrinhos = Math.floor(paraCofrinhos * fator);
  }

  const pesos = ativos.map((c) => (c.aporteSugerido && c.aporteSugerido > 0 ? c.aporteSugerido : 1));
  const somaDosPesos = pesos.reduce((s, p) => s + p, 0);
  const cofrinhos = ativos
    .map((c, i) => ({ cofrinhoId: c.id, nome: c.nome, valor: Math.min(c.falta, Math.floor((paraCofrinhos * pesos[i]) / somaDosPesos)) }))
    .filter((c) => c.valor > 0);
  const total = paraReserva + cofrinhos.reduce((s, c) => s + c.valor, 0);
  if (total <= 0) return null;
  return {
    reserva: paraReserva,
    cofrinhos,
    total,
    reservaPct: Math.round((paraReserva / salario) * 100),
    cofrinhosPct: Math.round(((total - paraReserva) / salario) * 100),
  };
}
