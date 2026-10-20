import { textoParaCentavos } from '@/core/utils/currency';
import { pareceArquivoBinario, parseDataExtrato, removerBOM } from '@/core/utils/importParsers';
import { bancoPorCodigo, bancoPorTexto, origemPorNomeDoArquivo } from './bancos';
import { hashTexto, idExternoDeLinhas } from './deduplicar';
import { semAcentos } from './normalizarDescricao';
import { reconhecerLayout } from './layouts';
import type { BancoId, ExtratoLido, MarcaParcela, OrigemExtrato, TransacaoLida } from './tipos';

// ---------------------------------------------------------------- CSV

export type TabelaCsv = {
  cabecalho: string[];
  linhas: string[][];
  /** Número (1 = primeira) da linha do cabeçalho no arquivo. */
  linhaDoCabecalho: number;
};

/** Papel de cada coluna, pelo índice no cabeçalho. Precisa de valor OU débito/crédito. */
export type MapeamentoColunas = {
  data: number;
  descricao: number[];
  valor?: number;
  debito?: number;
  credito?: number;
  /** Coluna "C/D", "Tipo", "Natureza" que diz se é entrada ou saída. */
  tipo?: number;
  parcela?: number;
  /** Coluna com identificador único da transação (o Nubank tem). */
  identificador?: number;
};

function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const caractere = linha[i];
    if (caractere === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (caractere === separador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += caractere;
    }
  }
  campos.push(atual.trim());
  return campos;
}

/** Separador mais provável: o que aparece mais vezes, igual, nas primeiras linhas com conteúdo. */
function detectarSeparador(linhas: string[]): string {
  const candidatos = [';', ',', '\t'];
  const amostra = linhas.slice(0, 20);
  let melhor = ';';
  let melhorNota = -1;
  for (const separador of candidatos) {
    // quantas linhas têm a mesma quantidade de colunas (a mais comum), vezes essa quantidade
    const frequencia = new Map<number, number>();
    for (const linha of amostra) {
      const colunas = dividirLinha(linha, separador).length;
      if (colunas > 1) frequencia.set(colunas, (frequencia.get(colunas) ?? 0) + 1);
    }
    let nota = 0;
    for (const [colunas, vezes] of frequencia) nota = Math.max(nota, colunas * vezes);
    if (nota > melhorNota) {
      melhor = separador;
      melhorNota = nota;
    }
  }
  return melhor;
}

/** Cabeçalho comparável: minúsculas, sem acentos, sem pontuação. */
export function normalizarCabecalho(texto: string): string {
  return semAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9$/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAPEIS: { papel: keyof MapeamentoColunas; padrao: RegExp }[] = [
  { papel: 'data', padrao: /^(data|date|dt)\b|^data (de |do )?(lancamento|compra|movimento|transacao|operacao)/ },
  { papel: 'credito', padrao: /^(credito|entrada|entradas)\b/ },
  { papel: 'debito', padrao: /^(debito|saida|saidas)\b/ },
  { papel: 'valor', padrao: /^(valor|amount|quantia|montante)\b|valor .*r\$|valor em r|^r\$$/ },
  { papel: 'tipo', padrao: /^(tipo|natureza|d\/c|c\/d|dc|cd|tipo lancamento|tipo de lancamento|tipo da transacao)$/ },
  { papel: 'parcela', padrao: /^(parcela|parcelas|parc)\b/ },
  { papel: 'identificador', padrao: /^(identificador|id|id da transacao|codigo|fitid)$/ },
  {
    papel: 'descricao',
    padrao: /^(descricao|historico|lancamento|lancamentos|titulo|title|estabelecimento|detalhes|memo|description|nome|favorecido|movimentacao|descricao da transacao|transacao)\b/,
  },
];

/** Colunas que nunca são o valor da transação, mesmo com "valor" no nome. */
const NAO_E_VALOR = /saldo|dolar|us\$|em us|cotacao|limite/;
/** Colunas com "nome" ou "descrição" no nome que não descrevem a transação. */
const NAO_E_DESCRICAO = /cartao|portador|titular|categoria|agencia|conta|documento|docto/;

/** Tenta descobrir o papel de cada coluna pelo nome. null se faltar data, descrição ou valor. */
export function mapearColunasPeloCabecalho(cabecalho: string[]): MapeamentoColunas | null {
  const normalizados = cabecalho.map(normalizarCabecalho);
  const achados: Partial<Record<keyof MapeamentoColunas, number>> = {};
  const descricoes: number[] = [];

  normalizados.forEach((nome, indice) => {
    if (nome === '') return;
    for (const { papel, padrao } of PAPEIS) {
      if (!padrao.test(nome)) continue;
      if ((papel === 'valor' || papel === 'debito' || papel === 'credito') && NAO_E_VALOR.test(nome)) return;
      if (papel === 'descricao' && NAO_E_DESCRICAO.test(nome)) return;
      if (papel === 'descricao') {
        descricoes.push(indice);
      } else if (achados[papel] === undefined) {
        achados[papel] = indice;
      }
      return;
    }
  });

  const temValor = achados.valor !== undefined || achados.debito !== undefined || achados.credito !== undefined;
  if (achados.data === undefined || descricoes.length === 0 || !temValor) return null;
  return {
    data: achados.data,
    descricao: descricoes,
    valor: achados.valor,
    debito: achados.debito,
    credito: achados.credito,
    tipo: achados.tipo,
    parcela: achados.parcela,
    identificador: achados.identificador,
  };
}

/** Separa o CSV e acha a linha de cabeçalho (bancos costumam pôr linhas de título antes dela). */
export function lerTabelaCsv(texto: string): TabelaCsv | null {
  const todas = texto.split(/\r\n|\n|\r/);
  const comConteudo = todas.map((linha, i) => ({ linha, numero: i + 1 })).filter((l) => l.linha.trim() !== '');
  if (comConteudo.length < 2) return null;

  const separador = detectarSeparador(comConteudo.map((l) => l.linha));
  const divididas = comConteudo.map((l) => ({ campos: dividirLinha(l.linha, separador), numero: l.numero }));

  const indiceCabecalho = divididas.slice(0, 30).findIndex((l) => mapearColunasPeloCabecalho(l.campos) !== null);
  const inicio = indiceCabecalho >= 0 ? indiceCabecalho : divididas.findIndex((l) => l.campos.length > 1);
  if (inicio < 0) return null;

  const cabecalho = divididas[inicio].campos;
  return {
    cabecalho,
    linhaDoCabecalho: divididas[inicio].numero,
    linhas: divididas.slice(inicio + 1).filter((l) => l.campos.some((c) => c !== '')).map((l) => l.campos),
  };
}

const LINHA_DE_SALDO = /^(SALDO|S A L D O|TOTAL|SUBTOTAL|LANCAMENTOS FUTUROS|SALDO ANTERIOR|SALDO DO DIA|SALDO FINAL)\b/;

function lerParcelaDaColuna(texto: string): MarcaParcela | null {
  const achado = texto.match(/(\d{1,2})\s*(\/|de)\s*(\d{1,2})/i);
  if (!achado) return null;
  const numero = Number(achado[1]);
  const total = Number(achado[3]);
  return numero >= 1 && total >= 2 && numero <= total ? { numero, total } : null;
}

/** "D", "Débito", "Saída" → saída; "C", "Crédito", "Entrada" → entrada. */
function sentidoDoTipo(texto: string): -1 | 1 | null {
  const t = semAcentos(texto);
  if (/^(D|DEBITO|SAIDA|DEB)\b/.test(t)) return -1;
  if (/^(C|CREDITO|ENTRADA|CRED)\b/.test(t)) return 1;
  return null;
}

/** "1.234,56 D" / "-50,00" / "50,00-": valor em centavos com o sinal que o texto indica. */
function lerValorComSinal(texto: string): number {
  const limpo = texto.trim();
  const centavos = textoParaCentavos(limpo);
  if (!Number.isFinite(centavos)) return Number.NaN;
  const sufixo = semAcentos(limpo).match(/\b([DC])$/);
  if (sufixo) return sufixo[1] === 'D' ? -Math.abs(centavos) : Math.abs(centavos);
  if (/-\s*$/.test(limpo)) return -Math.abs(centavos);
  return centavos;
}

/**
 * Linhas do CSV → transações, com o mapeamento de colunas dado (detectado ou escolhido pelo
 * usuário). `inverterSinal` é para arquivos em que a compra vem negativa.
 */
export function lerCsvComMapeamento(
  tabela: TabelaCsv,
  mapeamento: MapeamentoColunas,
  banco: BancoId | null,
  origem: OrigemExtrato | null,
  opcoes: { inverterSinal?: boolean } = {}
): ExtratoLido {
  const lidas: Omit<TransacaoLida, 'idExterno'>[] = [];
  const identificadores: (string | null)[] = [];
  let ignoradas = 0;

  tabela.linhas.forEach((campos, i) => {
    const pegar = (indice: number | undefined) => (indice === undefined ? '' : (campos[indice] ?? '').trim());
    const descricao = mapeamento.descricao
      .map(pegar)
      .filter((parte, posicao, todas) => parte !== '' && todas.indexOf(parte) === posicao)
      .join(' - ');
    const data = parseDataExtrato(pegar(mapeamento.data));

    let valor = Number.NaN;
    if (mapeamento.valor !== undefined && pegar(mapeamento.valor) !== '') {
      valor = lerValorComSinal(pegar(mapeamento.valor));
    } else {
      const credito = pegar(mapeamento.credito) !== '' ? Math.abs(lerValorComSinal(pegar(mapeamento.credito))) : 0;
      const debito = pegar(mapeamento.debito) !== '' ? Math.abs(lerValorComSinal(pegar(mapeamento.debito))) : 0;
      if (pegar(mapeamento.credito) !== '' || pegar(mapeamento.debito) !== '') valor = credito - debito;
    }
    if (mapeamento.tipo !== undefined && Number.isFinite(valor)) {
      const sentido = sentidoDoTipo(pegar(mapeamento.tipo));
      if (sentido !== null) valor = sentido * Math.abs(valor);
    }
    if (opcoes.inverterSinal && Number.isFinite(valor)) valor = -valor;

    if (!data || !Number.isFinite(valor) || valor === 0 || LINHA_DE_SALDO.test(semAcentos(descricao))) {
      ignoradas++;
      return;
    }
    lidas.push({
      data,
      descricao: descricao || 'Importado do extrato',
      valor,
      parcela: mapeamento.parcela !== undefined ? lerParcelaDaColuna(pegar(mapeamento.parcela)) : null,
      linha: tabela.linhaDoCabecalho + i + 1,
    });
    identificadores.push(mapeamento.identificador !== undefined && pegar(mapeamento.identificador) !== '' ? pegar(mapeamento.identificador) : null);
  });

  const prefixo = `csv:${banco ?? 'outro'}`;
  const porHash = idExternoDeLinhas(lidas, prefixo);
  const transacoes = lidas.map((t, i) => ({
    ...t,
    idExterno: identificadores[i] ? `${prefixo}:id:${identificadores[i]}` : porHash[i],
  }));
  return montarExtrato('csv', banco, origem, transacoes, ignoradas);
}

// ---------------------------------------------------------------- OFX

function campoOfx(bloco: string, nome: string): string | null {
  const achado = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
  const valor = achado?.[1]?.trim();
  return valor ? valor : null;
}

function lerOfx(texto: string, nomeArquivo: string): ExtratoLido {
  const ehCartao = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(texto);
  const codigo = campoOfx(texto, 'BANKID');
  const org = campoOfx(texto, 'ORG') ?? '';
  const conta = campoOfx(texto, 'ACCTID') ?? '';
  const banco = (codigo ? bancoPorCodigo(codigo) : null) ?? bancoPorTexto(org) ?? bancoPorTexto(nomeArquivo);

  const blocos = texto.match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) ?? [];
  const transacoes: TransacaoLida[] = [];
  let ignoradas = 0;
  const vistos = new Map<string, number>();

  blocos.forEach((bloco, i) => {
    const data = campoOfx(bloco, 'DTPOSTED');
    const valorTexto = campoOfx(bloco, 'TRNAMT');
    const valorOfx = valorTexto ? textoParaCentavos(valorTexto) : Number.NaN;
    if (!data || !/^\d{8}/.test(data) || !Number.isFinite(valorOfx) || valorOfx === 0) {
      ignoradas++;
      return;
    }
    const memo = campoOfx(bloco, 'MEMO');
    const nome = campoOfx(bloco, 'NAME');
    // quando os dois existem e dizem coisas diferentes, os dois ajudam ("PIX ENVIADO" + "MARIA")
    const descricao =
      memo && nome && !memo.toUpperCase().includes(nome.toUpperCase()) && !nome.toUpperCase().includes(memo.toUpperCase())
        ? `${memo} ${nome}`
        : (memo ?? nome ?? 'Importado do extrato');

    const iso = `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`;
    // na fatura em OFX a compra vem negativa (débito no cartão); aqui compra é positiva
    const valor = ehCartao ? -valorOfx : valorOfx;
    const fitid = campoOfx(bloco, 'FITID');
    // alguns bancos repetem o FITID entre transações diferentes: a ocorrência desempata
    const chave = fitid ?? hashTexto(`${iso}|${valor}|${descricao}`);
    const ocorrencia = (vistos.get(chave) ?? 0) + 1;
    vistos.set(chave, ocorrencia);

    transacoes.push({
      data: iso,
      descricao: descricao.trim(),
      valor,
      parcela: null,
      linha: i + 1,
      idExterno: `ofx:${banco ?? codigo ?? 'outro'}:${conta}:${chave}${ocorrencia > 1 ? `#${ocorrencia}` : ''}`,
    });
  });

  return montarExtrato('ofx', banco, ehCartao ? 'cartao' : 'conta', transacoes, ignoradas);
}

// ---------------------------------------------------------------- geral

function montarExtrato(
  formato: ExtratoLido['formato'],
  banco: BancoId | null,
  origem: OrigemExtrato | null,
  transacoes: TransacaoLida[],
  ignoradas: number
): ExtratoLido {
  const datas = transacoes.map((t) => t.data).sort();
  return {
    formato,
    banco,
    origem,
    transacoes,
    ignoradas,
    periodo: datas.length > 0 ? { inicio: datas[0], fim: datas[datas.length - 1] } : null,
  };
}

export type ResultadoLeitura =
  | { ok: true; extrato: ExtratoLido }
  /** CSV que o app não reconheceu: o usuário diz qual coluna é qual. */
  | { ok: false; motivo: 'precisa_mapear'; tabela: TabelaCsv; banco: BancoId | null; origem: OrigemExtrato | null }
  | { ok: false; motivo: 'nao_suportado' | 'sem_transacoes'; mensagem: string };

const MENSAGEM_NAO_SUPORTADO =
  'Esse arquivo não é CSV nem OFX. PDF não é suportado: exporte o extrato em CSV ou OFX no app do banco.';

/**
 * Primeira etapa da importação: lê um extrato de conta ou fatura de cartão, em OFX ou CSV de
 * qualquer um dos bancos conhecidos, e devolve as transações no formato único do app. Quando o
 * CSV é de um formato desconhecido, devolve a tabela para o usuário mapear as colunas.
 */
export function lerExtrato(conteudo: string, nomeArquivo: string): ResultadoLeitura {
  const texto = removerBOM(conteudo);
  if (/\.pdf$/i.test(nomeArquivo) || pareceArquivoBinario(texto)) {
    return { ok: false, motivo: 'nao_suportado', mensagem: MENSAGEM_NAO_SUPORTADO };
  }

  if (/\.ofx$/i.test(nomeArquivo) || /<OFX>/i.test(texto)) {
    const extrato = lerOfx(texto, nomeArquivo);
    return extrato.transacoes.length > 0
      ? { ok: true, extrato }
      : { ok: false, motivo: 'sem_transacoes', mensagem: 'Não encontrei transações nesse arquivo OFX.' };
  }

  const tabela = lerTabelaCsv(texto);
  if (!tabela || tabela.linhas.length === 0) {
    return { ok: false, motivo: 'nao_suportado', mensagem: MENSAGEM_NAO_SUPORTADO };
  }

  const layout = reconhecerLayout(tabela.cabecalho.map(normalizarCabecalho));
  const banco = layout?.banco ?? bancoPorTexto(nomeArquivo);
  const origem = layout?.origem ?? origemPorNomeDoArquivo(nomeArquivo);
  const mapeamento = layout?.mapear(tabela.cabecalho.map(normalizarCabecalho)) ?? mapearColunasPeloCabecalho(tabela.cabecalho);
  if (!mapeamento) return { ok: false, motivo: 'precisa_mapear', tabela, banco, origem };

  const extrato = lerCsvComMapeamento(tabela, mapeamento, banco, origem, { inverterSinal: layout?.inverterSinal });
  return extrato.transacoes.length > 0
    ? { ok: true, extrato }
    : { ok: false, motivo: 'precisa_mapear', tabela, banco, origem };
}
