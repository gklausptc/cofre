import { describe, expect, it } from '@jest/globals';
import { legendaDoCofrinho, resumirMetasFinanceiras } from '@/domain/usecases/resumirMetasFinanceiras';
import { umAporte, umCofrinho } from '@/test/fabricas';

const viagem = umCofrinho({ id: 1, nome: 'Viagem', valorMeta: 500000 });
const notebook = umCofrinho({ id: 2, nome: 'Notebook', valorMeta: 300000, status: 'concluido' });
const carro = umCofrinho({ id: 3, nome: 'Carro', valorMeta: 0 });

const aportes = [
  umAporte({ cofrinhoId: 1, valor: 100000, data: '2026-01-10' }),
  umAporte({ cofrinhoId: 1, valor: 50000, data: '2026-02-10' }),
  umAporte({ cofrinhoId: 2, valor: 300000, data: '2026-01-05' }),
];

const reserva = { valorAtual: 600000, valorMeta: 1200000, mesesCoberturaDesejados: 6 };

describe('resumirMetasFinanceiras', () => {
  it('soma o que está guardado na reserva e nos cofrinhos, e o total das metas', () => {
    const resumo = resumirMetasFinanceiras(reserva, [viagem, notebook, carro], aportes);

    expect(resumo.totalGuardado).toBe(600000 + 150000 + 300000);
    expect(resumo.totalDasMetas).toBe(1200000 + 500000 + 300000);
  });

  it('progresso da reserva', () => {
    expect(resumirMetasFinanceiras(reserva, [], []).reserva).toEqual({
      valorAtual: 600000,
      valorMeta: 1200000,
      percentual: 0.5,
      mesesCobertura: 6,
    });
  });

  it('sem reserva configurada, só os cofrinhos contam', () => {
    const resumo = resumirMetasFinanceiras(null, [viagem], aportes);
    expect(resumo.reserva).toBeNull();
    expect(resumo.totalGuardado).toBe(150000);
  });

  it('cofrinhos ativos primeiro, concluídos no fim, cada um com seu progresso', () => {
    const resumo = resumirMetasFinanceiras(null, [notebook, viagem, carro], aportes);

    expect(resumo.cofrinhos.map((c) => c.cofrinho.nome)).toEqual(['Viagem', 'Carro', 'Notebook']);
    expect(resumo.cofrinhos[0].progresso.valorAtual).toBe(150000);
    expect(resumo.cofrinhos[0].progresso.percentual).toBeCloseTo(0.3);
  });
});

describe('legendaDoCofrinho', () => {
  it('concluído, com previsão ou sem nada', () => {
    expect(legendaDoCofrinho({ status: 'concluido' }, { valorAtual: 1, percentual: 1, previsaoMeses: null })).toBe(
      'Meta concluída 🎉'
    );
    expect(legendaDoCofrinho({ status: 'ativo' }, { valorAtual: 1, percentual: 0.1, previsaoMeses: 1 })).toBe('Previsão: 1 mês');
    expect(legendaDoCofrinho({ status: 'ativo' }, { valorAtual: 1, percentual: 0.1, previsaoMeses: 4 })).toBe(
      'Previsão: 4 meses'
    );
    expect(legendaDoCofrinho({ status: 'ativo' }, { valorAtual: 0, percentual: 0, previsaoMeses: null })).toBeUndefined();
  });
});
