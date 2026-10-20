import { describe, expect, it } from '@jest/globals';
import {
  descreverEspera,
  esperaAposFalhas,
  lerTentativasPin,
  registrarFalhaPin,
  segundosDeEspera,
  SEM_FALHAS,
  tentativasAntesDeEsperar,
  type TentativasPin,
} from '@/domain/usecases/bloqueioPin';

const agora = 1_800_000_000_000;

function errar(vezes: number, inicio: TentativasPin = SEM_FALHAS): TentativasPin {
  let estado = inicio;
  for (let i = 0; i < vezes; i++) estado = registrarFalhaPin(estado, agora);
  return estado;
}

describe('bloqueio progressivo do PIN', () => {
  it('as 4 primeiras falhas não fazem esperar', () => {
    expect(segundosDeEspera(errar(4), agora)).toBe(0);
    expect(tentativasAntesDeEsperar(errar(4))).toBe(1);
  });

  it('5ª falha: 30 s; 6ª: 1 min; 7ª em diante: 5 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(esperaAposFalhas)).toEqual([0, 0, 0, 0, 30, 60, 300, 300]);
    expect(segundosDeEspera(errar(5), agora)).toBe(30);
    expect(segundosDeEspera(errar(6), agora)).toBe(60);
    expect(segundosDeEspera(errar(9), agora)).toBe(300);
  });

  it('a espera diminui com o tempo e acaba', () => {
    const bloqueado = errar(5);
    expect(segundosDeEspera(bloqueado, agora + 10_500)).toBe(20);
    expect(segundosDeEspera(bloqueado, agora + 30_000)).toBe(0);
  });

  it('lê o estado gravado e ignora o que for inválido', () => {
    const estado = errar(5);
    expect(lerTentativasPin(JSON.stringify(estado))).toEqual(estado);
    expect(lerTentativasPin(null)).toEqual(SEM_FALHAS);
    expect(lerTentativasPin('lixo')).toEqual(SEM_FALHAS);
    expect(lerTentativasPin('{"falhasSeguidas":-1,"bloqueadoAte":null}')).toEqual(SEM_FALHAS);
  });

  it('descreve a espera', () => {
    expect(descreverEspera(30)).toBe('30 s');
    expect(descreverEspera(60)).toBe('1 min');
    expect(descreverEspera(299)).toBe('5 min');
  });
});
