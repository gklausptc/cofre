import { COMERCIANTES, type Comerciante } from '@/domain/dados/comerciantes';
import { categoriaMaisGeral } from '@/domain/dados/categoriasPadrao';
import { CATEGORIAS_DOS_BANCOS, PALAVRAS_CHAVE_DESPESA, PALAVRAS_CHAVE_RECEITA } from '@/domain/dados/palavrasChave';
import { ehPagamentoDeCompromisso } from '@/domain/usecases/naturezaMovimentacao';
import { normalizarDescricao, semAcentos } from './normalizarDescricao';
import { semelhanca } from './deduplicar';
import { contemNomeProprio } from './nomesProprios';
import type { Categoria, ContatoPix, GastoRapido, Movimentacao, RegraCategorizacao } from '@/domain/types/entities';

/** Saída de dinheiro (compra, pagamento) ou entrada (salário, PIX recebido). */
export type NaturezaDaLinha = 'despesa' | 'receita';

export type CamadaCategorizacao = 'regra' | 'contato' | 'dicionario' | 'banco' | 'historico' | 'palavra_chave';

/** O que uma regra ou um contato manda fazer além (ou em vez) de categorizar. */
export type AcaoEspecial = 'ignorar' | 'transferencia_propria' | 'emprestimo' | 'conta_fixa';

export type Categorizacao = {
  categoriaId: number | null;
  membroId: number | null;
  /** De 0 a 1. Abaixo de CONFIANCA_MINIMA a linha vira pergunta. */
  confianca: number;
  camada: CamadaCategorizacao | null;
  /** Frase curta para a tela: de onde veio a sugestão. */
  motivo: string;
  acao: AcaoEspecial | null;
  regraId: number | null;
  contatoPixId: number | null;
  contaFixaId: number | null;
  /** Comerciante reconhecido no dicionário (nome para exibir). */
  comerciante: string | null;
  /** Comerciante que costuma cobrar todo mês (streaming, academia…). */
  assinatura: boolean;
  /** PIX para (ou de) uma pessoa, pelo nome normalizado: vira uma pergunta por pessoa. */
  pessoaPix: string | null;
};

export const CONFIANCA_MINIMA = 0.7;

export const CONFIANCA = {
  regra: 1,
  contato: 1,
  dicionario: 0.9,
  banco: 0.8,
  historicoForte: 0.8,
  historico: 0.7,
  palavraChave: 0.7,
  historicoParecido: 0.6,
} as const;

/** Um lançamento já categorizado no app, para aprender com ele. */
export type LancamentoCategorizado = { descricao: string; categoriaId: number; natureza: NaturezaDaLinha };

export type ContextoCategorizacao = {
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[];
  regras: RegraCategorizacao[];
  contatos: ContatoPix[];
  historico: LancamentoCategorizado[];
  /** Nomes do titular como os bancos escrevem (PIX para si mesmo é transferência). */
  nomesProprios?: string[];
};

export type LinhaParaCategorizar = {
  descricao: string;
  natureza: NaturezaDaLinha;
  categoriaDoBanco?: string;
};

/** Movimentações e gastos com categoria, como histórico (sem transferências nem pagamentos de fatura/conta fixa). */
export function historicoDeCategorias(
  movimentacoes: Pick<Movimentacao, 'tipo' | 'descricao' | 'categoriaId' | 'origem' | 'faturaId' | 'parcelaId'>[],
  gastos: Pick<GastoRapido, 'descricao' | 'categoriaId'>[]
): LancamentoCategorizado[] {
  const historico: LancamentoCategorizado[] = [];
  for (const m of movimentacoes) {
    if (m.categoriaId === null || !m.descricao || m.tipo === 'transferencia' || m.origem === 'interna' || ehPagamentoDeCompromisso(m)) continue;
    historico.push({ descricao: m.descricao, categoriaId: m.categoriaId, natureza: m.tipo === 'entrada' ? 'receita' : 'despesa' });
  }
  for (const g of gastos) {
    if (g.categoriaId === null || !g.descricao) continue;
    historico.push({ descricao: g.descricao, categoriaId: g.categoriaId, natureza: 'despesa' });
  }
  return historico;
}

/** Palavras que indicam empresa, não pessoa, no nome de um PIX. */
const PALAVRAS_DE_EMPRESA = new Set([
  'LTDA', 'ME', 'MEI', 'EIRELI', 'EPP', 'SA', 'CIA', 'COMERCIO', 'COM', 'SERVICOS', 'SERV', 'DISTRIBUIDORA',
  'SUPERMERCADO', 'SUPERMERCADOS', 'MERCADO', 'LOJA', 'LOJAS', 'RESTAURANTE', 'PAGAMENTOS', 'PAGAMENTO',
  'INSTITUICAO', 'BANCO', 'TECNOLOGIA', 'BRASIL', 'FARMACIA', 'POSTO', 'AUTO', 'IND', 'INDUSTRIA',
  'EMPREENDIMENTOS', 'PARTICIPACOES', 'HOLDING', 'ASSOCIACAO', 'CONDOMINIO', 'IGREJA', 'ESCOLA', 'COLEGIO',
  'CLINICA', 'SEGUROS', 'SEGURADORA', 'CONSULTORIA', 'ASSESSORIA', 'TRANSPORTES', 'LOGISTICA', 'DIGITAL',
  'ONLINE', 'STORE', 'SHOP', 'IMPORTADORA', 'EXPRESS', 'TELECOM', 'ENERGIA', 'SANEAMENTO', 'EDUCACAO',
  'INSTITUTO', 'FUNDACAO', 'COOPERATIVA', 'SINDICATO', 'PREFEITURA', 'GOVERNO', 'MUNICIPIO', 'ESTADO',
]);

/** Palavras soltas das palavras-chave ("PASTEL", "DOCES", "PARK"): nome com elas é de loja, não de pessoa. */
const PALAVRAS_DE_NEGOCIO: { palavra: string; inteira: boolean }[] = [...PALAVRAS_CHAVE_DESPESA, ...PALAVRAS_CHAVE_RECEITA]
  .flatMap(({ palavras }) => palavras)
  .map((p) => semAcentos(p))
  .filter((p) => !p.trim().includes(' ') && p.trim().length >= 3)
  .map((p) => ({ palavra: p.trim(), inteira: p.endsWith(' ') }));

function palavraDeNegocio(palavra: string): boolean {
  return PALAVRAS_DE_NEGOCIO.some((n) => (n.inteira ? palavra === n.palavra : palavra.startsWith(n.palavra)));
}

/** "MARIA DA SILVA" sim; "PADARIA PAO QUENTE LTDA", "PASTEL DO GUI" e "NETFLIX" não. */
export function pareceNomeDePessoa(nome: string): boolean {
  const palavras = nome.split(' ').filter(Boolean);
  if (palavras.length < 2 || palavras.length > 7) return false;
  if (!palavras.every((p) => /^[A-Z]+$/.test(p))) return false;
  if (palavras.some((p) => PALAVRAS_DE_EMPRESA.has(p))) return false;
  if (palavras.some(palavraDeNegocio)) return false;
  // "S A" no fim é sociedade anônima
  return !(palavras.length >= 3 && palavras[palavras.length - 2] === 'S' && palavras[palavras.length - 1] === 'A');
}

/** A descrição normalizada só com letras, números e espaços ("NETFLIX.COM" → "NETFLIX COM"). */
function textoComNumeros(descricao: string): string {
  return normalizarDescricao(descricao)
    .normalizada.replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUFIXOS_DE_EMPRESA = new Set(['LTDA', 'LTD', 'ME', 'EPP', 'EIRELI', 'MEI', 'SA', 'CIA', 'INC', 'LLC', 'SLU']);
/** Prefixos de operação que sobram em alguns bancos ("Pix - Enviado" do BB). */
const OPERACAO_NO_COMECO = /^(PIX (AUTOMATICO )?(ENVIADO|RECEBIDO|ENVIO|EMITIDO|AGENDADO)( (PARA|DE))? |PIX |TRANSFERIDO (DA|PARA|DE) )/;

/**
 * Tira do texto o que muda de uma compra para outra na mesma loja: números de loja, CNPJ,
 * códigos ("KEETA 0123" e "KEETA 0457" → "KEETA"), sufixo de empresa no fim ("LTDA", "S A") e
 * o "PIX ENVIADO" que alguns bancos deixam no começo.
 */
export function limparTextoDeRegra(texto: string): string {
  const palavras = texto
    .replace(OPERACAO_NO_COMECO, '')
    .split(' ')
    .map((p) => p.replace(/\d{3,}/g, ''))
    .filter((p) => p !== '' && !/^\d+$/.test(p));
  while (palavras.length > 1 && SUFIXOS_DE_EMPRESA.has(palavras[palavras.length - 1])) palavras.pop();
  if (palavras.length > 2 && palavras[palavras.length - 2] === 'S' && palavras[palavras.length - 1] === 'A') palavras.splice(-2);
  return palavras.join(' ');
}

/**
 * Texto que agrupa e casa regras, histórico e perguntas: a descrição normalizada sem os números
 * e códigos que mudam a cada compra (ver `limparTextoDeRegra`). As regras guardam o padrão neste
 * formato (as antigas, que tinham números, são limpas na hora de comparar).
 */
export function textoParaRegra(descricao: string): string {
  return limparTextoDeRegra(textoComNumeros(descricao));
}

const comEspacos = (texto: string) => ` ${texto} `;
/** O trecho aparece como palavra(s) inteira(s). */
const contemPalavras = (texto: string, trecho: string) => comEspacos(texto).includes(comEspacos(trecho));

/** O que pode vir colado depois de uma marca sem mudar o que ela é ("NETFLIXCOM", "SHOPEEBR", "KEETA0123"). */
const SUFIXO_DE_MARCA = /^(COM|COMBR|BR|BRASIL|PAY|APP|SHOP|STORE|ONLINE|\d+)?$/;

/** O trecho escrito junto aparece em sequência de palavras ("MERCADOLIVRE" casa "MERCADO LIVRE", e vice-versa). */
function contemColado(texto: string, compacto: string, aceitaSufixo: boolean): boolean {
  if (compacto.length < 5) return false;
  const palavras = texto.split(' ');
  for (let i = 0; i < palavras.length; i++) {
    if (aceitaSufixo && palavras[i].startsWith(compacto) && SUFIXO_DE_MARCA.test(palavras[i].slice(compacto.length))) return true;
    let juntas = '';
    for (let j = i; j < palavras.length && juntas.length < compacto.length; j++) {
      juntas += palavras[j];
      if (juntas === compacto) return true;
    }
  }
  return false;
}

type Trecho = { texto: string; compacto: string; inteira: boolean; temEspaco: boolean };
function prepararTrecho(bruto: string): Trecho {
  const texto = semAcentos(bruto).trim();
  return { texto, compacto: texto.replace(/ /g, ''), inteira: bruto.endsWith(' '), temEspaco: texto.includes(' ') };
}

/** Padrão do dicionário: palavra(s) inteira(s), ou colado ("AUTOPOSTO", "NETFLIXCOM"). */
function casaComerciante(texto: string, t: Trecho): boolean {
  return contemPalavras(texto, t.texto) || contemColado(texto, t.compacto, !t.temEspaco);
}

/** Palavra-chave: começo de palavra ("FARMA" em "FARMACIA"), palavra inteira (espaço no fim) ou colada. */
function casaPalavraChave(texto: string, t: Trecho): boolean {
  if (t.inteira) return contemPalavras(texto, t.texto);
  if (comEspacos(texto).includes(` ${t.texto}`)) return true;
  return t.temEspaco && texto.split(' ').some((p) => p.startsWith(t.compacto));
}

/** Intermediários de pagamento: o nome deles não diz o que foi comprado. */
const INTERMEDIARIOS = /\b(MERCADO PAGO|MERCADOPAGO|PAGSEGURO|PAG SEGURO|PICPAY|PAYPAL|EBANX|INSTITUICAO DE PAGA\w*|INSTITUICAO DE PAGAMENTO)\b/g;

function regraCasa(regra: RegraCategorizacao, texto: string, natureza: NaturezaDaLinha): boolean {
  if (regra.natureza !== 'ambas' && regra.natureza !== natureza) return false;
  const padrao = limparTextoDeRegra(regra.padrao);
  if (padrao === '') return false;
  if (regra.tipoCorrespondencia === 'exato') return texto === padrao;
  if (regra.tipoCorrespondencia === 'comeca_com') return texto.startsWith(padrao);
  return contemPalavras(texto, padrao);
}

const PESO_CORRESPONDENCIA: Record<RegraCategorizacao['tipoCorrespondencia'], number> = {
  exato: 3,
  comeca_com: 2,
  contem: 1,
};

/** Mesmo nome de PIX, inclusive quando um banco corta o sobrenome ("MARIA DA SILVA SAN"). */
function mesmoContato(nomeDoExtrato: string, contato: string): boolean {
  if (nomeDoExtrato === contato) return true;
  const menor = nomeDoExtrato.length < contato.length ? nomeDoExtrato : contato;
  const maior = menor === nomeDoExtrato ? contato : nomeDoExtrato;
  return menor.split(' ').length >= 2 && maior.startsWith(menor);
}

function acaoDoContato(tipo: ContatoPix['tipo']): AcaoEspecial | null {
  if (tipo === 'propria') return 'transferencia_propria';
  if (tipo === 'emprestimo') return 'emprestimo';
  return null;
}

type IndiceHistorico = Map<string, Map<number, number>>;

function primeiraPalavra(texto: string): string {
  return texto.split(' ')[0] ?? '';
}

const SEM_CATEGORIA: Omit<Categorizacao, 'pessoaPix'> = {
  categoriaId: null,
  membroId: null,
  confianca: 0,
  camada: null,
  motivo: 'Não reconhecido',
  acao: null,
  regraId: null,
  contatoPixId: null,
  contaFixaId: null,
  comerciante: null,
  assinatura: false,
};

/**
 * Monta o categorizador uma vez (índices de categorias, comerciantes e histórico) e devolve a
 * função que categoriza cada linha. Camadas, da mais forte para a mais fraca:
 * 1. regras do usuário e contatos PIX (1,0);
 * 2. dicionário de comerciantes (0,9);
 * 3. categoria que o banco mandou no arquivo (0,8);
 * 4. histórico: descrição igual já categorizada (0,7 a 0,8);
 * 5. palavras-chave (0,7);
 * 6. histórico: descrição parecida (0,6, vira pergunta com sugestão).
 * PIX para pessoa não passa pelas camadas 3 e 5 (o nome de alguém não diz o que foi pago).
 */
export function prepararCategorizador(contexto: ContextoCategorizacao): (linha: LinhaParaCategorizar) => Categorizacao {
  const categoriaPorNome = new Map<string, Pick<Categoria, 'id' | 'nome' | 'tipo'>>();
  for (const c of contexto.categorias) categoriaPorNome.set(`${c.tipo}|${semAcentos(c.nome)}`, c);
  // a categoria detalhada (Mercado) ou, se a pessoa não tem mais ela, a geral (Alimentação)
  const categoriaDe = (nome: string, natureza: NaturezaDaLinha): Pick<Categoria, 'id' | 'nome' | 'tipo'> | null => {
    const direta = categoriaPorNome.get(`${natureza}|${semAcentos(nome)}`);
    if (direta) return direta;
    const geral = categoriaMaisGeral(nome, natureza);
    return geral ? (categoriaPorNome.get(`${natureza}|${semAcentos(geral)}`) ?? null) : null;
  };
  const idsValidos = new Set(contexto.categorias.map((c) => c.id));

  const regras = [...contexto.regras].sort(
    (a, b) =>
      PESO_CORRESPONDENCIA[b.tipoCorrespondencia] - PESO_CORRESPONDENCIA[a.tipoCorrespondencia] ||
      b.padrao.length - a.padrao.length
  );

  const padroesDoDicionario = COMERCIANTES.flatMap((comerciante) =>
    comerciante.padroes.map((padrao) => ({ trecho: prepararTrecho(padrao), comerciante }))
  ).sort((a, b) => b.trecho.texto.length - a.trecho.texto.length);

  const palavrasDespesa = PALAVRAS_CHAVE_DESPESA.flatMap(({ categoria, palavras }) =>
    palavras.map((palavra) => ({ trecho: prepararTrecho(palavra), categoria }))
  ).sort((a, b) => b.trecho.texto.length - a.trecho.texto.length);
  const palavrasReceita = PALAVRAS_CHAVE_RECEITA.flatMap(({ categoria, palavras }) =>
    palavras.map((palavra) => ({ trecho: prepararTrecho(palavra), categoria }))
  ).sort((a, b) => b.trecho.texto.length - a.trecho.texto.length);

  // histórico: contagem de categorias por descrição normalizada, separado por natureza
  const historico: Record<NaturezaDaLinha, IndiceHistorico> = { despesa: new Map(), receita: new Map() };
  const porPrimeiraPalavra: Record<NaturezaDaLinha, Map<string, string[]>> = { despesa: new Map(), receita: new Map() };
  for (const h of contexto.historico) {
    if (!idsValidos.has(h.categoriaId)) continue;
    const chave = textoParaRegra(h.descricao);
    if (chave === '') continue;
    const contagem = historico[h.natureza].get(chave) ?? new Map<number, number>();
    if (contagem.size === 0) {
      historico[h.natureza].set(chave, contagem);
      const lista = porPrimeiraPalavra[h.natureza].get(primeiraPalavra(chave)) ?? [];
      lista.push(chave);
      porPrimeiraPalavra[h.natureza].set(primeiraPalavra(chave), lista);
    }
    contagem.set(h.categoriaId, (contagem.get(h.categoriaId) ?? 0) + 1);
  }

  const maisUsada = (contagem: Map<number, number>) => {
    let melhor: { categoriaId: number; vezes: number } | null = null;
    let total = 0;
    for (const [categoriaId, vezes] of contagem) {
      total += vezes;
      if (!melhor || vezes > melhor.vezes) melhor = { categoriaId, vezes };
    }
    return melhor ? { ...melhor, total } : null;
  };

  return (linha) => {
    const { intermediador, pix } = normalizarDescricao(linha.descricao);
    const comNumeros = textoComNumeros(linha.descricao);
    const texto = limparTextoDeRegra(comNumeros);
    // sem o nome do intermediário ("MERCADO PAGO" não é mercado)
    const paraPalavras = comNumeros.replace(INTERMEDIARIOS, ' ').replace(/\s+/g, ' ').trim();
    const pessoaPix = pix && pareceNomeDePessoa(pix.nome) ? pix.nome : null;
    const resultado = (parcial: Partial<Categorizacao>): Categorizacao => ({ ...SEM_CATEGORIA, pessoaPix, ...parcial });

    // 1. regras do usuário
    const regra = regras.find((r) => regraCasa(r, texto, linha.natureza));
    if (regra && (regra.acao !== 'categorizar' || (regra.categoriaId !== null && idsValidos.has(regra.categoriaId)))) {
      return resultado({
        categoriaId: regra.categoriaId !== null && idsValidos.has(regra.categoriaId) ? regra.categoriaId : null,
        membroId: regra.membroId,
        confianca: CONFIANCA.regra,
        camada: 'regra',
        motivo: `Sua regra: "${regra.padrao}"`,
        acao: regra.acao === 'categorizar' ? null : regra.acao,
        regraId: regra.id,
        contaFixaId: regra.contaFixaId,
      });
    }

    // 1b. PIX ou transferência para você mesmo (outra conta sua, poupança)
    if (contemNomeProprio(linha.descricao, contexto.nomesProprios ?? [])) {
      return resultado({
        pessoaPix: null,
        confianca: CONFIANCA.contato,
        camada: 'contato',
        motivo: 'Para você mesmo (outra conta sua)',
        acao: 'transferencia_propria',
      });
    }

    // 1c. contatos PIX
    if (pix) {
      const contato = contexto.contatos.find((c) => mesmoContato(pix.nome, c.nomeNormalizado));
      if (contato) {
        const acao = acaoDoContato(contato.tipo);
        const categoriaId = contato.categoriaId !== null && idsValidos.has(contato.categoriaId) ? contato.categoriaId : null;
        if (acao || categoriaId !== null) {
          return resultado({
            categoriaId,
            membroId: contato.membroId,
            confianca: CONFIANCA.contato,
            camada: 'contato',
            motivo: `Contato PIX: ${contato.apelido}`,
            acao,
            contatoPixId: contato.id,
          });
        }
      }
    }

    // 2. dicionário de comerciantes (só para saídas: entrada de "UBER" é repasse, não compra)
    if (linha.natureza === 'despesa') {
      let comerciante: Comerciante | null = null;
      if (intermediador) comerciante = COMERCIANTES.find((c) => c.intermediador === intermediador) ?? null;
      if (!comerciante) comerciante = padroesDoDicionario.find(({ trecho }) => casaComerciante(comNumeros, trecho))?.comerciante ?? null;
      const categoria = comerciante ? categoriaDe(comerciante.categoria, 'despesa') : null;
      if (comerciante && categoria) {
        return resultado({
          categoriaId: categoria.id,
          confianca: CONFIANCA.dicionario,
          camada: 'dicionario',
          motivo: `Reconhecido: ${comerciante.nome}`,
          comerciante: comerciante.nome,
          assinatura: comerciante.assinatura === true,
        });
      }
    }

    // 3. categoria que o próprio banco deu
    if (!pessoaPix && linha.categoriaDoBanco && linha.natureza === 'despesa') {
      const doBanco = semAcentos(linha.categoriaDoBanco);
      const mapeada = CATEGORIAS_DOS_BANCOS.find(({ trecho }) => doBanco.includes(trecho));
      const categoria = mapeada ? categoriaDe(mapeada.categoria, 'despesa') : null;
      if (categoria) {
        return resultado({
          categoriaId: categoria.id,
          confianca: CONFIANCA.banco,
          camada: 'banco',
          motivo: `Categoria do banco: ${linha.categoriaDoBanco}`,
        });
      }
    }

    // 4. histórico: a mesma descrição já foi categorizada
    const exata = texto !== '' ? historico[linha.natureza].get(texto) : undefined;
    const usada = exata ? maisUsada(exata) : null;
    if (usada && usada.vezes / usada.total >= 0.75) {
      return resultado({
        categoriaId: usada.categoriaId,
        confianca: usada.vezes >= 2 ? CONFIANCA.historicoForte : CONFIANCA.historico,
        camada: 'historico',
        motivo: usada.vezes >= 2 ? `Você lançou assim ${usada.vezes} vezes` : 'Você lançou assim antes',
      });
    }

    // 5. palavras-chave
    if (!pessoaPix && paraPalavras !== '') {
      const lista = linha.natureza === 'despesa' ? palavrasDespesa : palavrasReceita;
      const achada = lista.find(({ trecho }) => casaPalavraChave(paraPalavras, trecho));
      const categoria = achada ? categoriaDe(achada.categoria, linha.natureza) : null;
      if (achada && categoria) {
        return resultado({
          categoriaId: categoria.id,
          confianca: CONFIANCA.palavraChave,
          camada: 'palavra_chave',
          motivo: `Pela palavra "${achada.trecho.texto}"`,
        });
      }
    }

    // 6. histórico: descrição parecida (mesma primeira palavra e semelhança alta)
    if (texto !== '') {
      const candidatas = porPrimeiraPalavra[linha.natureza].get(primeiraPalavra(texto)) ?? [];
      let melhor: { chave: string; nota: number } | null = null;
      for (const chave of candidatas) {
        const nota = semelhanca(chave, texto);
        if (nota >= 0.75 && (!melhor || nota > melhor.nota)) melhor = { chave, nota };
      }
      const parecida = melhor ? maisUsada(historico[linha.natureza].get(melhor.chave) ?? new Map()) : null;
      if (parecida) {
        return resultado({
          categoriaId: parecida.categoriaId,
          confianca: CONFIANCA.historicoParecido,
          camada: 'historico',
          motivo: 'Parecido com algo que você já lançou',
        });
      }
    }

    return resultado({ motivo: pessoaPix ? 'PIX para pessoa' : 'Não reconhecido' });
  };
}

/** Atalho para uma linha só (testes e telas simples). */
export function categorizar(linha: LinhaParaCategorizar, contexto: ContextoCategorizacao): Categorizacao {
  return prepararCategorizador(contexto)(linha);
}
