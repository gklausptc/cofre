import { Leitor, ehBytes, ehDic, ehFluxo, ehLista, ehNome, ehOperador, type Dic, type DocumentoParaFontes, type Valor } from './sintaxe';

/**
 * Como transformar os bytes de um texto do PDF em letras, e quanto cada letra ocupa (para
 * saber onde o texto termina e pôr espaço entre pedaços). Usa o ToUnicode da fonte quando
 * existe; senão, a codificação (WinAnsi, a dos PDFs de bancos brasileiros, ou MacRoman) com
 * as "Differences".
 */

export type Glifo = { unicode: string; largura: number; espaco: boolean };
export type Fonte = { glifos(bytes: Uint8Array): Glifo[] };

/** Windows-1252 de 0x80 a 0x9F; o resto é Latin-1. */
const WINANSI_80 = '€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ';
const MACROMAN_80 =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

function tabelaBase(nome: string | null): string[] {
  const tabela: string[] = [];
  for (let i = 0; i < 256; i++) {
    if (i < 32) tabela.push('');
    else if (i < 127) tabela.push(String.fromCharCode(i));
    else if (i >= 0x80 && i < 0xa0 && nome !== 'MacRomanEncoding') tabela.push(WINANSI_80[i - 0x80].replace('\u0000', ''));
    else if (i >= 0x80 && nome === 'MacRomanEncoding') tabela.push(MACROMAN_80[i - 0x80] ?? '');
    else if (i === 127) tabela.push('');
    else tabela.push(String.fromCharCode(i));
  }
  return tabela;
}

const ACENTOS: Record<string, string> = {
  grave: 'àèìòùÀÈÌÒÙ',
  acute: 'áéíóúÁÉÍÓÚ',
  circumflex: 'âêîôûÂÊÎÔÛ',
  dieresis: 'äëïöüÄËÏÖÜ',
};
const NOMES_DE_GLIFOS: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&',
  quotesingle: "'", quoteright: '’', quoteleft: '‘', parenleft: '(', parenright: ')', asterisk: '*', plus: '+',
  comma: ',', hyphen: '-', minus: '-', period: '.', slash: '/', colon: ':', semicolon: ';', less: '<', equal: '=',
  greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', underscore: '_',
  braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', degree: '°', ordfeminine: 'ª', ordmasculine: 'º',
  endash: '–', emdash: '—', bullet: '•', Euro: '€', quotedblleft: '“', quotedblright: '”', ellipsis: '…',
  nbspace: ' ', nonbreakingspace: ' ', atilde: 'ã', otilde: 'õ', ntilde: 'ñ', Atilde: 'Ã', Otilde: 'Õ', Ntilde: 'Ñ',
  ccedilla: 'ç', Ccedilla: 'Ç', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', section: '§', registered: '®', copyright: '©', trademark: '™',
};
for (const [acento, letras] of Object.entries(ACENTOS)) {
  'aeiouAEIOU'.split('').forEach((base, i) => {
    NOMES_DE_GLIFOS[`${base}${acento}`] = letras[i];
  });
}

/** Letra a partir do nome do glifo ("aacute", "uni00E9", "A"). */
export function letraDoGlifo(nome: string): string {
  const conhecido = NOMES_DE_GLIFOS[nome];
  if (conhecido !== undefined) return conhecido;
  if (/^[A-Za-z]$/.test(nome)) return nome;
  const uni = nome.match(/^uni([0-9A-Fa-f]{4})/) ?? nome.match(/^u([0-9A-Fa-f]{4,6})$/);
  if (uni) return String.fromCodePoint(parseInt(uni[1], 16));
  return '';
}

type MapaUnicode = { mapa: Map<number, string>; tamanhos: number[] };

function utf16(bytes: Uint8Array): string {
  if (bytes.length === 1) return String.fromCharCode(bytes[0]);
  let texto = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) texto += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return texto;
}

const codigoDe = (bytes: Uint8Array) => bytes.reduce((codigo, b) => codigo * 256 + b, 0);

/** ToUnicode: "beginbfchar <01> <0041> endbfchar", "beginbfrange <01> <05> <0041> endbfrange". */
export function lerCMap(dados: Uint8Array): MapaUnicode {
  const mapa = new Map<number, string>();
  const tamanhos = new Set<number>();
  const leitor = new Leitor(dados, 0);
  const valores: Valor[] = [];
  let modo: 'nenhum' | 'espaco' | 'char' | 'range' = 'nenhum';
  for (let passos = 0; passos < 500_000; passos++) {
    const token = leitor.ler();
    if (token === undefined) break;
    if (!ehOperador(token)) {
      if (modo !== 'nenhum') valores.push(token);
      continue;
    }
    if (token.v === 'begincodespacerange') modo = 'espaco';
    else if (token.v === 'beginbfchar') modo = 'char';
    else if (token.v === 'beginbfrange') modo = 'range';
    else if (token.v.startsWith('end') && modo !== 'nenhum') {
      if (modo === 'espaco') {
        for (let i = 0; i + 1 < valores.length; i += 2) {
          const inicio = valores[i];
          if (ehBytes(inicio) && inicio.v.length > 0) tamanhos.add(inicio.v.length);
        }
      } else if (modo === 'char') {
        for (let i = 0; i + 1 < valores.length; i += 2) {
          const origem = valores[i];
          const destino = valores[i + 1];
          if (!ehBytes(origem)) continue;
          tamanhos.add(origem.v.length);
          if (ehBytes(destino)) mapa.set(codigoDe(origem.v), utf16(destino.v));
          else if (ehNome(destino)) mapa.set(codigoDe(origem.v), letraDoGlifo(destino.v));
        }
      } else {
        for (let i = 0; i + 2 < valores.length; i += 3) {
          const baixo = valores[i];
          const alto = valores[i + 1];
          const destino = valores[i + 2];
          if (!ehBytes(baixo) || !ehBytes(alto)) continue;
          tamanhos.add(baixo.v.length);
          const de = codigoDe(baixo.v);
          const ate = Math.min(codigoDe(alto.v), de + 65535);
          if (ehBytes(destino)) {
            const base = utf16(destino.v);
            const ultimo = base.charCodeAt(base.length - 1);
            for (let c = de; c <= ate; c++) mapa.set(c, base.slice(0, -1) + String.fromCharCode(ultimo + (c - de)));
          } else if (ehLista(destino)) {
            destino.v.forEach((item, k) => {
              if (ehBytes(item) && de + k <= ate) mapa.set(de + k, utf16(item.v));
            });
          }
        }
      }
      valores.length = 0;
      modo = 'nenhum';
    }
  }
  return { mapa, tamanhos: [...tamanhos].sort((a, b) => a - b) };
}

function numero(v: Valor | null, padrao: number): number {
  return typeof v === 'number' ? v : padrao;
}

/** Larguras da fonte composta: "/W [1 [500 600] 10 20 450]". */
function largurasCompostas(doc: DocumentoParaFontes, w: Valor | null): Map<number, number> {
  const larguras = new Map<number, number>();
  if (!ehLista(w)) return larguras;
  const itens = w.v.map((v) => doc.resolver(v));
  for (let i = 0; i < itens.length; ) {
    const primeiro = itens[i];
    const segundo = itens[i + 1];
    if (typeof primeiro !== 'number') break;
    if (ehLista(segundo)) {
      segundo.v.forEach((largura, k) => {
        const valor = doc.resolver(largura);
        if (typeof valor === 'number') larguras.set(primeiro + k, valor);
      });
      i += 2;
    } else {
      const largura = itens[i + 2];
      if (typeof segundo !== 'number' || typeof largura !== 'number') break;
      for (let c = primeiro; c <= Math.min(segundo, primeiro + 65535); c++) larguras.set(c, largura);
      i += 3;
    }
  }
  return larguras;
}

export function criarFonte(doc: DocumentoParaFontes, dic: Dic): Fonte {
  const subtipo = dic.v.get('Subtype');
  const fluxoToUnicode = doc.resolver(dic.v.get('ToUnicode'));
  const dadosToUnicode = ehFluxo(fluxoToUnicode) ? doc.dadosDoFluxo(fluxoToUnicode) : null;
  const toUnicode = dadosToUnicode ? lerCMap(dadosToUnicode) : null;

  if (ehNome(subtipo) && subtipo.v === 'Type0') {
    const descendentes = doc.resolver(dic.v.get('DescendantFonts'));
    const descendente = ehLista(descendentes) ? doc.resolver(descendentes.v[0]) : null;
    const padrao = ehDic(descendente) ? numero(doc.resolver(descendente.v.get('DW')), 1000) : 1000;
    const larguras = ehDic(descendente) ? largurasCompostas(doc, doc.resolver(descendente.v.get('W'))) : new Map<number, number>();
    const tamanhos = toUnicode && toUnicode.tamanhos.length > 0 ? toUnicode.tamanhos : [2];
    return {
      glifos(bytes) {
        const glifos: Glifo[] = [];
        for (let i = 0; i < bytes.length; ) {
          const tamanho = tamanhos.find((t) => toUnicode?.mapa.has(codigoDe(bytes.subarray(i, i + t)))) ?? tamanhos[tamanhos.length - 1];
          const codigo = codigoDe(bytes.subarray(i, i + tamanho));
          glifos.push({ unicode: toUnicode?.mapa.get(codigo) ?? '', largura: larguras.get(codigo) ?? padrao, espaco: false });
          i += tamanho;
        }
        return glifos;
      },
    };
  }

  const codificacao = doc.resolver(dic.v.get('Encoding'));
  const nomeBase = ehNome(codificacao)
    ? codificacao.v
    : ehDic(codificacao) && ehNome(codificacao.v.get('BaseEncoding') ?? null)
      ? (codificacao.v.get('BaseEncoding') as { v: string }).v
      : null;
  const tabela = tabelaBase(nomeBase);
  if (ehDic(codificacao)) {
    const diferencas = doc.resolver(codificacao.v.get('Differences'));
    if (ehLista(diferencas)) {
      let codigo = 0;
      for (const item of diferencas.v) {
        if (typeof item === 'number') codigo = item;
        else if (ehNome(item)) {
          if (codigo >= 0 && codigo < 256) tabela[codigo] = letraDoGlifo(item.v);
          codigo++;
        }
      }
    }
  }
  const primeiro = numero(doc.resolver(dic.v.get('FirstChar')), 0);
  const listaDeLarguras = doc.resolver(dic.v.get('Widths'));
  const larguras = ehLista(listaDeLarguras) ? listaDeLarguras.v.map((v) => numero(doc.resolver(v), 0)) : null;
  const descritor = doc.resolver(dic.v.get('FontDescriptor'));
  const faltando = ehDic(descritor) ? numero(doc.resolver(descritor.v.get('MissingWidth')), 0) : 0;

  return {
    glifos(bytes) {
      return Array.from(bytes, (codigo) => {
        const unicode = toUnicode?.mapa.get(codigo) ?? tabela[codigo] ?? '';
        const daTabela = larguras ? larguras[codigo - primeiro] : undefined;
        // fonte padrão sem tabela de larguras (Helvetica): meia letra, espaço mais estreito
        const largura = daTabela !== undefined && daTabela > 0 ? daTabela : faltando > 0 ? faltando : codigo === 32 ? 278 : 520;
        return { unicode, largura, espaco: codigo === 32 };
      });
    },
  };
}
