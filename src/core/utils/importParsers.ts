import { textoParaCentavos } from './currency';

export type LinhaCSV = string[];

function detectarDelimitador(primeiraLinha: string): string {
  const virgulas = (primeiraLinha.match(/,/g) ?? []).length;
  const pontoVirgulas = (primeiraLinha.match(/;/g) ?? []).length;
  return pontoVirgulas > virgulas ? ';' : ',';
}

function dividirLinhaCSV(linha: string, delimitador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const char = linha[i];
    if (char === '"') {
      dentroDeAspas = !dentroDeAspas;
    } else if (char === delimitador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += char;
    }
  }
  campos.push(atual.trim());
  return campos.map((c) => c.replace(/^"|"$/g, ''));
}

export function parseCSV(conteudo: string): { headers: string[]; linhas: LinhaCSV[] } {
  const linhasBrutas = conteudo.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (linhasBrutas.length === 0) return { headers: [], linhas: [] };

  const delimitador = detectarDelimitador(linhasBrutas[0]);
  const [headerBruto, ...resto] = linhasBrutas;

  return {
    headers: dividirLinhaCSV(headerBruto, delimitador),
    linhas: resto.map((linha) => dividirLinhaCSV(linha, delimitador)),
  };
}

/** Converte '1.234,56', '1,234.56', '1234.56' ou '-50,00' em centavos (NaN se não for número). */
export function parseValorEmCentavos(valor: string): number {
  return textoParaCentavos(valor);
}

function dataValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(ano, mes, 0).getDate();
}

/**
 * Converte datas comuns em extratos para ISO 'YYYY-MM-DD': DD/MM/AAAA, DD/MM/AA, DD-MM-AAAA,
 * DD.MM.AAAA e AAAA-MM-DD (com ou sem hora depois). null se não for uma data que existe.
 */
export function parseDataExtrato(valor: string): string | null {
  const texto = valor.trim().replace(/^"|"$/g, '');

  const isoMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, ano, mes, dia] = isoMatch;
    return dataValida(Number(ano), Number(mes), Number(dia)) ? `${ano}-${mes}-${dia}` : null;
  }

  const brMatch = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (brMatch) {
    const [, dia, mes, anoBruto] = brMatch;
    const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
    if (ano.length !== 4 || !dataValida(Number(ano), Number(mes), Number(dia))) return null;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  return null;
}

export type TransacaoImportada = {
  data: string;
  descricao: string;
  /** Em centavos, com sinal (negativo = saída). */
  valor: number;
};

/** Parser leve de OFX (formato SGML, não XML — por isso via regex, não parser de XML). */
export function parseOFX(conteudo: string): TransacaoImportada[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  return blocos
    .map((bloco): TransacaoImportada | null => {
      const dataMatch = bloco.match(/<DTPOSTED>([^\s<]+)/i);
      const valorMatch = bloco.match(/<TRNAMT>([^\s<]+)/i);
      const memoMatch = bloco.match(/<MEMO>([^<\r\n]+)/i);
      const nameMatch = bloco.match(/<NAME>([^<\r\n]+)/i);

      if (!dataMatch || !valorMatch) return null;

      const bruto = dataMatch[1];
      const data = `${bruto.slice(0, 4)}-${bruto.slice(4, 6)}-${bruto.slice(6, 8)}`;
      const valor = textoParaCentavos(valorMatch[1]);
      const descricao = (memoMatch?.[1] ?? nameMatch?.[1] ?? 'Importado do extrato').trim();

      if (Number.isNaN(valor)) return null;
      return { data, descricao, valor };
    })
    .filter((t): t is TransacaoImportada => t !== null);
}

/** Bytes 0x80–0x9F do Windows-1252 (no Latin-1 puro eles são caracteres de controle). */
const WINDOWS_1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/**
 * Decodifica bytes como Windows-1252 (o "Latin-1" que os bancos brasileiros usam de verdade),
 * um byte = um caractere. Feito à mão porque `TextDecoder` não está disponível em todo
 * runtime do Hermes.
 */
export function decodificarLatin1(bytes: Uint8Array): string {
  let texto = '';
  for (let i = 0; i < bytes.length; i++) {
    texto += WINDOWS_1252[bytes[i]] ?? String.fromCharCode(bytes[i]);
  }
  return texto;
}

/** Texto lido como UTF-8 que veio com caracteres de substituição provavelmente era Latin-1. */
export function temCaracteresInvalidos(texto: string): boolean {
  return texto.includes('\uFFFD');
}

/** PDF, imagens e outros binários não são extratos em texto. */
export function pareceArquivoBinario(texto: string): boolean {
  if (texto.startsWith('%PDF')) return true;
  const amostra = texto.slice(0, 2000);
  return amostra.includes('\u0000');
}

/** Remove o BOM UTF-8 que alguns exportadores colocam no início do arquivo. */
export function removerBOM(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}
