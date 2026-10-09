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

/** Converte '1.234,56' ou '1234.56' ou '-50,00' em number. */
export function parseValorMonetario(valor: string): number {
  const limpo = valor.trim().replace(/[^\d,.-]/g, '');
  if (limpo.includes(',') && limpo.includes('.')) {
    return parseFloat(limpo.replace(/\./g, '').replace(',', '.'));
  }
  if (limpo.includes(',')) {
    return parseFloat(limpo.replace(',', '.'));
  }
  return parseFloat(limpo);
}

/** Converte datas comuns em extratos (DD/MM/AAAA, AAAA-MM-DD) para ISO 'YYYY-MM-DD'. */
export function parseDataExtrato(valor: string): string | null {
  const texto = valor.trim();

  const isoMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const brMatch = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (brMatch) {
    const [, dia, mes, anoBruto] = brMatch;
    const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  return null;
}

export type TransacaoImportada = {
  data: string;
  descricao: string;
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
      const valor = parseFloat(valorMatch[1]);
      const descricao = (memoMatch?.[1] ?? nameMatch?.[1] ?? 'Importado do extrato').trim();

      if (Number.isNaN(valor)) return null;
      return { data, descricao, valor };
    })
    .filter((t): t is TransacaoImportada => t !== null);
}

/**
 * Decodifica bytes como ISO-8859-1 (Latin-1), um byte = um caractere — extratos de bancos
 * brasileiros costumam vir nessa codificação (ou Windows-1252, que é quase igual).
 * Feito à mão porque `TextDecoder` não está disponível em todo runtime do Hermes.
 */
export function decodificarLatin1(bytes: Uint8Array): string {
  let texto = '';
  for (let i = 0; i < bytes.length; i++) {
    texto += String.fromCharCode(bytes[i]);
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
