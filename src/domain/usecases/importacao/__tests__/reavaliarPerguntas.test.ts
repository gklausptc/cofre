import { describe, expect, it } from '@jest/globals';
import { prepararCategorizador } from '@/domain/usecases/importacao/categorizar';
import { reavaliarPerguntas, type PerguntaParaReavaliar } from '@/domain/usecases/importacao/reavaliarPerguntas';
import { CATEGORIAS_PADRAO } from '@/domain/dados/categoriasPadrao';
import type { DadosDaPergunta } from '@/domain/types/perguntas';
import { umaCategoria } from '@/test/fabricas';

const categorias = CATEGORIAS_PADRAO.map((c, i) => umaCategoria({ id: 1 + i, nome: c.nome, tipo: c.tipo }));
const idDa = (nome: string) => categorias.find((c) => c.nome === nome && c.tipo === 'despesa')?.id;
const categorizar = prepararCategorizador({ categorias, regras: [], contatos: [], historico: [], nomesProprios: ['MARIA S OLIVEIRA'] });

let proximo = 0;
function pergunta(dados: DadosDaPergunta, valor = 1000): PerguntaParaReavaliar {
  proximo++;
  return {
    id: proximo,
    tipo: dados.tipo,
    chave: dados.tipo === 'pix_pessoa' ? `pix:${dados.nome}` : `cat:velha-${proximo}`,
    titulo: dados.tipo === 'pix_pessoa' ? `Quem é ${dados.nome}?` : 'Que gasto é este?',
    dados: JSON.stringify(dados),
    valor,
    quantidade: dados.linhas.length,
  };
}
const linha = (idExterno: string) => ({ importacaoId: 1, idExterno, onde: 'movimentacao' as const });
const categoria = (exemplo: string, ids: string[]): DadosDaPergunta => ({
  tipo: 'categoria',
  natureza: 'despesa',
  padrao: exemplo,
  exemplo,
  sugestaoCategoriaId: null,
  linhas: ids.map(linha),
});

describe('reavaliarPerguntas', () => {
  it('responde sozinho o que agora reconhece, inclusive o PIX que era loja ou era você', () => {
    const perguntas = [
      pergunta(categoria('Compra com Cartão AUTOPOSTO IRMAOS', ['a'])),
      pergunta(categoria('XPTO COMERCIAL 123', ['b'])),
      pergunta({ tipo: 'pix_pessoa', natureza: 'despesa', nome: 'PASTEL DO GUI', exemplo: 'Pix - Enviado PASTEL DO GUI', linhas: [linha('c')] }),
      pergunta({ tipo: 'pix_pessoa', natureza: 'despesa', nome: 'MARIA S OLIVEIRA', exemplo: 'Pix - Enviado MARIA S OLIVEIRA', linhas: [linha('d')] }),
      pergunta({ tipo: 'pix_pessoa', natureza: 'despesa', nome: 'JOSE DA SILVA', exemplo: 'Pix - Enviado JOSE DA SILVA', linhas: [linha('e')] }),
    ];
    const { respostas } = reavaliarPerguntas(perguntas, categorizar);
    expect(respostas.map((r) => [r.perguntaId, r.resposta])).toEqual([
      [perguntas[0].id, { tipo: 'categoria', categoriaId: idDa('Combustível'), sempre: false }],
      [perguntas[2].id, { tipo: 'categoria', categoriaId: idDa('Alimentação'), sempre: false }],
      [perguntas[3].id, { tipo: 'transferencia_propria', outraContaId: null, sempre: false }],
    ]);
  });

  it('junta a mesma loja que só mudava o número', () => {
    const a = pergunta(categoria('ARMAZEM MISTERIO 0012', ['x', 'y']), 3000);
    const b = pergunta(categoria('ARMAZEM MISTERIO 0457', ['z']), 1000);
    const { juncoes } = reavaliarPerguntas([a, b], categorizar);
    expect(juncoes).toHaveLength(1);
    expect(juncoes[0]).toMatchObject({ manterId: a.id, juntarIds: [b.id], chave: 'cat:despesa|ARMAZEM MISTERIO', valor: 4000, quantidade: 3 });
    expect(juncoes[0].dados.linhas.map((l) => l.idExterno)).toEqual(['x', 'y', 'z']);
  });
});
