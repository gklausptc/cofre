import { calcularProgressoCofrinho, type ProgressoCofrinho } from '@/domain/usecases/calcularProgressoCofrinho';
import type { AporteCofrinho, Cofrinho } from '@/domain/types/entities';
import type { ReservaComSaldo } from '@/domain/usecases/saldoReserva';

export type ProgressoReserva = {
  valorAtual: number;
  valorMeta: number;
  percentual: number;
  mesesCobertura: number | null;
};

export type CofrinhoComProgresso = { cofrinho: Cofrinho; progresso: ProgressoCofrinho };

export type ResumoMetasFinanceiras = {
  reserva: ProgressoReserva | null;
  /** Ativos primeiro, concluídos no fim (cada grupo na ordem de cadastro). */
  cofrinhos: CofrinhoComProgresso[];
  /** Reserva + cofrinhos, em centavos. */
  totalGuardado: number;
  /** Soma das metas da reserva e dos cofrinhos, em centavos. */
  totalDasMetas: number;
};

/**
 * Visão única das metas financeiras: reserva de emergência e cofrinhos, com o progresso
 * de cada um e o total guardado.
 */
export function resumirMetasFinanceiras(
  reserva: Pick<ReservaComSaldo, 'valorAtual' | 'valorMeta' | 'mesesCoberturaDesejados'> | null,
  cofrinhos: Cofrinho[],
  aportes: AporteCofrinho[]
): ResumoMetasFinanceiras {
  const progressoReserva: ProgressoReserva | null = reserva
    ? {
        valorAtual: reserva.valorAtual,
        valorMeta: reserva.valorMeta,
        percentual: reserva.valorMeta > 0 ? Math.min(reserva.valorAtual / reserva.valorMeta, 1) : 0,
        mesesCobertura: reserva.mesesCoberturaDesejados,
      }
    : null;

  const comProgresso = cofrinhos.map((cofrinho) => ({
    cofrinho,
    progresso: calcularProgressoCofrinho(
      cofrinho,
      aportes.filter((a) => a.cofrinhoId === cofrinho.id)
    ),
  }));
  const ordenados = [
    ...comProgresso.filter((c) => c.cofrinho.status !== 'concluido'),
    ...comProgresso.filter((c) => c.cofrinho.status === 'concluido'),
  ];

  const guardadoCofrinhos = comProgresso.reduce((soma, c) => soma + c.progresso.valorAtual, 0);
  const metasCofrinhos = cofrinhos.reduce((soma, c) => soma + c.valorMeta, 0);

  return {
    reserva: progressoReserva,
    cofrinhos: ordenados,
    totalGuardado: (progressoReserva?.valorAtual ?? 0) + guardadoCofrinhos,
    totalDasMetas: (progressoReserva?.valorMeta ?? 0) + metasCofrinhos,
  };
}

/** Texto de apoio do card de um cofrinho ("Meta concluída 🎉", "Previsão: 3 meses"). */
export function legendaDoCofrinho(cofrinho: Pick<Cofrinho, 'status'>, progresso: ProgressoCofrinho): string | undefined {
  if (cofrinho.status === 'concluido') return 'Meta concluída 🎉';
  if (progresso.previsaoMeses) {
    return `Previsão: ${progresso.previsaoMeses} ${progresso.previsaoMeses === 1 ? 'mês' : 'meses'}`;
  }
  return undefined;
}
