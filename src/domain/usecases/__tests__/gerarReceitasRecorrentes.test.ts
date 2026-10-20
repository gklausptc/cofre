import { describe, expect, it } from '@jest/globals';
import { gerarReceitasRecorrentes } from '@/domain/usecases/gerarReceitasRecorrentes';
import { umaMovimentacao } from '@/test/fabricas';

const hoje = new Date(2026, 3, 15); // abril de 2026

const salario = umaMovimentacao({
  id: 1,
  contaBancariaId: 3,
  tipo: 'entrada',
  valor: 500000,
  data: '2026-01-31',
  descricao: 'Salário',
  categoriaId: 9,
  membroId: 2,
  recorrente: true,
});

describe('gerarReceitasRecorrentes', () => {
  it('cria a cópia do mês atual a partir do modelo, no mesmo dia (limitado ao fim do mês)', () => {
    expect(gerarReceitasRecorrentes([salario], hoje)).toEqual([
      {
        contaBancariaId: 3,
        tipo: 'entrada',
        valor: 500000,
        data: '2026-04-30',
        descricao: 'Salário',
        categoriaId: 9,
        contaDestinoId: null,
        origem: 'manual',
        membroId: 2,
        reservarProximoMes: false,
        recorrente: false,
        recorrenteOrigemId: 1,
      },
    ]);
  });

  it('não duplica quando a cópia do mês já existe', () => {
    const copia = umaMovimentacao({ tipo: 'entrada', data: '2026-04-30', recorrenteOrigemId: 1 });
    expect(gerarReceitasRecorrentes([salario, copia], hoje)).toEqual([]);
  });

  it('não cria cópia no mês do próprio modelo', () => {
    expect(gerarReceitasRecorrentes([{ ...salario, data: '2026-04-05' }], hoje)).toEqual([]);
  });

  it('ignora entradas não recorrentes, saídas e as próprias cópias', () => {
    const avulsa = umaMovimentacao({ tipo: 'entrada', data: '2026-01-10' });
    const saidaRecorrente = umaMovimentacao({ tipo: 'saida', data: '2026-01-10', recorrente: true });
    const copiaAntiga = umaMovimentacao({ tipo: 'entrada', data: '2026-02-10', recorrente: true, recorrenteOrigemId: 50 });

    expect(gerarReceitasRecorrentes([avulsa, saidaRecorrente, copiaAntiga], hoje)).toEqual([]);
  });
});
