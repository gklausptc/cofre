import { CONFIANCA_MINIMA, textoParaRegra, type Categorizacao, type LinhaParaCategorizar } from './categorizar';
import type { RespostaPergunta } from './responderPergunta';
import type { PerguntaPendente } from '@/domain/types/entities';
import type { DadosDaPergunta, LinhaDaPergunta } from '@/domain/types/perguntas';

export type PerguntaParaReavaliar = Pick<PerguntaPendente, 'id' | 'tipo' | 'chave' | 'titulo' | 'dados' | 'valor' | 'quantidade'>;

export type RespostaAutomatica = { perguntaId: number; resposta: RespostaPergunta; motivo: string };

export type JuncaoDePerguntas = {
  manterId: number;
  juntarIds: number[];
  chave: string;
  titulo: string;
  dados: DadosDaPergunta;
  valor: number;
  quantidade: number;
};

export type ReavaliacaoDasPerguntas = { respostas: RespostaAutomatica[]; juncoes: JuncaoDePerguntas[] };

const mesmaLinha = (a: LinhaDaPergunta, b: LinhaDaPergunta) => a.importacaoId === b.importacaoId && a.idExterno === b.idExterno && a.onde === b.onde;

function juntarLinhas(listas: LinhaDaPergunta[][]): LinhaDaPergunta[] {
  const todas: LinhaDaPergunta[] = [];
  for (const lista of listas) for (const linha of lista) if (!todas.some((l) => mesmaLinha(l, linha))) todas.push(linha);
  return todas;
}

/**
 * Passa de novo as perguntas pendentes pelo categorizador de agora (dicionário maior, regras e
 * contatos que você criou depois, o seu nome): o que ele já sabe responder com confiança vira
 * resposta automática; e perguntas que agora têm a mesma chave (a mesma loja com outro número,
 * a mesma pessoa com o nome escrito de outro jeito) viram uma só.
 */
export function reavaliarPerguntas(
  perguntas: PerguntaParaReavaliar[],
  categorizar: (linha: LinhaParaCategorizar) => Categorizacao
): ReavaliacaoDasPerguntas {
  const respostas: RespostaAutomatica[] = [];
  const restantes: { pergunta: PerguntaParaReavaliar; dados: DadosDaPergunta; chave: string; titulo: string }[] = [];

  for (const pergunta of perguntas) {
    let dados: DadosDaPergunta;
    try {
      dados = JSON.parse(pergunta.dados) as DadosDaPergunta;
    } catch {
      continue;
    }
    if (dados.tipo !== 'categoria' && dados.tipo !== 'pix_pessoa') {
      restantes.push({ pergunta, dados, chave: pergunta.chave, titulo: pergunta.titulo });
      continue;
    }
    const c = categorizar({ descricao: dados.exemplo, natureza: dados.natureza });
    const reconhecida = c.categoriaId !== null && c.confianca >= CONFIANCA_MINIMA;
    if (c.acao === 'transferencia_propria') {
      respostas.push({ perguntaId: pergunta.id, resposta: { tipo: 'transferencia_propria', outraContaId: null, sempre: false }, motivo: c.motivo });
      continue;
    }
    if (c.acao === 'ignorar') {
      respostas.push({ perguntaId: pergunta.id, resposta: { tipo: 'ignorar', sempre: false }, motivo: c.motivo });
      continue;
    }
    // PIX: só deixa de perguntar "quem é" quando agora não parece mais pessoa (é loja) ou há contato
    if (reconhecida && c.categoriaId !== null && (dados.tipo === 'categoria' || c.pessoaPix === null || c.camada === 'contato' || c.camada === 'regra')) {
      respostas.push({ perguntaId: pergunta.id, resposta: { tipo: 'categoria', categoriaId: c.categoriaId, sempre: false }, motivo: c.motivo });
      continue;
    }
    if (dados.tipo === 'categoria') {
      const padrao = textoParaRegra(dados.exemplo);
      restantes.push({
        pergunta,
        dados: { ...dados, padrao: padrao || dados.padrao },
        chave: padrao ? `cat:${dados.natureza}|${padrao}` : pergunta.chave,
        titulo: pergunta.titulo,
      });
    } else {
      const nome = c.pessoaPix ?? dados.nome;
      restantes.push({ pergunta, dados: { ...dados, nome }, chave: `pix:${nome}`, titulo: `Quem é ${nome}?` });
    }
  }

  // perguntas com a mesma chave nova viram uma (fica a de maior valor)
  const porChave = new Map<string, typeof restantes>();
  for (const r of restantes) {
    if (r.dados.tipo !== 'categoria' && r.dados.tipo !== 'pix_pessoa') continue;
    porChave.set(r.chave, [...(porChave.get(r.chave) ?? []), r]);
  }
  const juncoes: JuncaoDePerguntas[] = [];
  for (const [chave, grupo] of porChave) {
    const mudouChave = grupo.some((r) => r.chave !== r.pergunta.chave || r.titulo !== r.pergunta.titulo);
    if (grupo.length < 2 && !mudouChave) continue;
    const ordenado = [...grupo].sort((a, b) => b.pergunta.valor - a.pergunta.valor);
    const [primeira, ...outras] = ordenado;
    const linhas = juntarLinhas(ordenado.map((r) => r.dados.linhas));
    juncoes.push({
      manterId: primeira.pergunta.id,
      juntarIds: outras.map((r) => r.pergunta.id),
      chave,
      titulo: primeira.titulo,
      dados: { ...primeira.dados, linhas } as DadosDaPergunta,
      valor: ordenado.reduce((s, r) => s + r.pergunta.valor, 0),
      quantidade: linhas.length,
    });
  }
  return { respostas, juncoes };
}
