import { describe, expect, it } from '@jest/globals';
import { calcularProgressoCofrinho } from '@/domain/usecases/calcularProgressoCofrinho';
import { umAporte } from '@/test/fabricas';

describe('calcularProgressoCofrinho', () => {
  it('soma os aportes e calcula o percentual da meta', () => {
    const progresso = calcularProgressoCofrinho({ valorMeta: 1000 }, [
      umAporte({ valor: 100, data: '2026-01-10' }),
      umAporte({ valor: 200, data: '2026-03-10' }),
    ]);

    expect(progresso.valorAtual).toBe(300);
    expect(progresso.percentual).toBeCloseTo(0.3);
  });

  it('prevê os meses que faltam pela média mensal dos aportes', () => {
    // 300 em 2 meses = 150/mês; faltam 700 → 5 meses
    const progresso = calcularProgressoCofrinho({ valorMeta: 1000 }, [
      umAporte({ valor: 100, data: '2026-01-10' }),
      umAporte({ valor: 200, data: '2026-03-10' }),
    ]);

    expect(progresso.previsaoMeses).toBe(5);
  });

  it('aportes no mesmo mês contam como 1 mês', () => {
    const progresso = calcularProgressoCofrinho({ valorMeta: 1000 }, [
      umAporte({ valor: 100, data: '2026-03-01' }),
      umAporte({ valor: 100, data: '2026-03-20' }),
    ]);

    expect(progresso.previsaoMeses).toBe(4);
  });

  it('sem histórico suficiente não mostra previsão', () => {
    expect(calcularProgressoCofrinho({ valorMeta: 1000 }, [umAporte({ valor: 100 })]).previsaoMeses).toBeNull();
    expect(calcularProgressoCofrinho({ valorMeta: 1000 }, []).valorAtual).toBe(0);
  });

  it('meta atingida: percentual limitado a 100% e sem previsão', () => {
    const progresso = calcularProgressoCofrinho({ valorMeta: 1000 }, [
      umAporte({ valor: 700, data: '2026-01-10' }),
      umAporte({ valor: 500, data: '2026-02-10' }),
    ]);

    expect(progresso.percentual).toBe(1);
    expect(progresso.previsaoMeses).toBeNull();
  });

  it('meta zero não divide por zero', () => {
    expect(calcularProgressoCofrinho({ valorMeta: 0 }, [umAporte({ valor: 10 })]).percentual).toBe(0);
  });
});
