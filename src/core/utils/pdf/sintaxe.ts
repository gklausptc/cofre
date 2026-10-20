/** Sintaxe do PDF: valores (números, nomes, textos, listas, dicionários, fluxos) e o leitor. */

// ---------------------------------------------------------------- valores do PDF

export type Nome = { t: 'nome'; v: string };
export type Ref = { t: 'ref'; num: number; gen: number };
export type Bytes = { t: 'texto'; v: Uint8Array };
export type Dic = { t: 'dic'; v: Map<string, Valor> };
export type Lista = { t: 'lista'; v: Valor[] };
export type Fluxo = { t: 'fluxo'; dic: Dic; v: Uint8Array };
export type Valor = number | boolean | null | Nome | Ref | Bytes | Dic | Lista | Fluxo;
export type Operador = { t: 'op'; v: string };
export type Token = Valor | Operador;

export const ehDic = (v: Valor | null | undefined): v is Dic => typeof v === 'object' && v !== null && v.t === 'dic';
export const ehFluxo = (v: Valor | null | undefined): v is Fluxo => typeof v === 'object' && v !== null && v.t === 'fluxo';
export const ehLista = (v: Valor | null | undefined): v is Lista => typeof v === 'object' && v !== null && v.t === 'lista';
export const ehNome = (v: Valor | null | undefined): v is Nome => typeof v === 'object' && v !== null && v.t === 'nome';
export const ehBytes = (v: Valor | null | undefined): v is Bytes => typeof v === 'object' && v !== null && v.t === 'texto';
export const ehRef = (v: Valor | null | undefined): v is Ref => typeof v === 'object' && v !== null && v.t === 'ref';
export const ehOperador = (v: Token): v is Operador => typeof v === 'object' && v !== null && v.t === 'op';

export const ESPACO = new Set([0, 9, 10, 12, 13, 32]);
const DELIMITADOR = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

export function latin1(dados: Uint8Array, inicio = 0, fim = dados.length): string {
  let texto = '';
  for (let i = inicio; i < fim; i += 8192) {
    texto += String.fromCharCode(...dados.subarray(i, Math.min(fim, i + 8192)));
  }
  return texto;
}

export function valorHex(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x37;
  if (c >= 0x61 && c <= 0x66) return c - 0x57;
  return -1;
}

/** Lê a sintaxe do PDF (objetos e conteúdo de página) a partir de uma posição. */
export class Leitor {
  constructor(
    readonly d: Uint8Array,
    public pos = 0
  ) {}

  pularEspacos(): void {
    const d = this.d;
    while (this.pos < d.length) {
      const c = d[this.pos];
      if (ESPACO.has(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < d.length && d[this.pos] !== 10 && d[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  private palavra(): string {
    const inicio = this.pos;
    while (this.pos < this.d.length && !ESPACO.has(this.d[this.pos]) && !DELIMITADOR.has(this.d[this.pos])) this.pos++;
    return latin1(this.d, inicio, this.pos);
  }

  ler(): Token | undefined {
    this.pularEspacos();
    const d = this.d;
    if (this.pos >= d.length) return undefined;
    const c = d[this.pos];
    if (c === 0x2f) {
      this.pos++;
      return { t: 'nome', v: this.palavra().replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) };
    }
    if (c === 0x28) return { t: 'texto', v: this.textoLiteral() };
    if (c === 0x3c) {
      if (d[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return this.dicionario();
      }
      return { t: 'texto', v: this.textoHex() };
    }
    if (c === 0x5b) {
      this.pos++;
      return this.lista();
    }
    if (c === 0x3e && d[this.pos + 1] === 0x3e) {
      this.pos += 2;
      return { t: 'op', v: '>>' };
    }
    if (DELIMITADOR.has(c)) {
      this.pos++;
      return { t: 'op', v: String.fromCharCode(c) };
    }
    const palavra = this.palavra();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(palavra)) {
      const numero = Number(palavra);
      if (/^\d+$/.test(palavra)) {
        // "12 0 R" é referência a outro objeto
        const salvo = this.pos;
        this.pularEspacos();
        const geracao = this.palavra();
        if (/^\d+$/.test(geracao)) {
          this.pularEspacos();
          const depois = d[this.pos + 1];
          if (d[this.pos] === 0x52 && (depois === undefined || ESPACO.has(depois) || DELIMITADOR.has(depois))) {
            this.pos++;
            return { t: 'ref', num: numero, gen: Number(geracao) };
          }
        }
        this.pos = salvo;
      }
      return numero;
    }
    if (palavra === 'true') return true;
    if (palavra === 'false') return false;
    if (palavra === 'null') return null;
    return { t: 'op', v: palavra };
  }

  private dicionario(): Dic {
    const v = new Map<string, Valor>();
    for (;;) {
      this.pularEspacos();
      if (this.pos >= this.d.length) break;
      if (this.d[this.pos] === 0x3e && this.d[this.pos + 1] === 0x3e) {
        this.pos += 2;
        break;
      }
      const chave = this.ler();
      if (chave === undefined) break;
      if (!(typeof chave === 'object' && chave !== null && chave.t === 'nome')) {
        if (ehOperador(chave) && chave.v === '>>') break;
        continue;
      }
      const valor = this.ler();
      if (valor === undefined) break;
      if (ehOperador(valor)) {
        if (valor.v === '>>') break;
        continue;
      }
      v.set(chave.v, valor);
    }
    return { t: 'dic', v };
  }

  private lista(): Lista {
    const v: Valor[] = [];
    for (;;) {
      this.pularEspacos();
      if (this.pos >= this.d.length) break;
      if (this.d[this.pos] === 0x5d) {
        this.pos++;
        break;
      }
      const item = this.ler();
      if (item === undefined) break;
      if (!ehOperador(item)) v.push(item);
    }
    return { t: 'lista', v };
  }

  private textoLiteral(): Uint8Array {
    const d = this.d;
    this.pos++;
    const saida: number[] = [];
    let nivel = 1;
    while (this.pos < d.length) {
      const c = d[this.pos++];
      if (c === 0x5c) {
        const n = d[this.pos++];
        if (n === 0x6e) saida.push(10);
        else if (n === 0x72) saida.push(13);
        else if (n === 0x74) saida.push(9);
        else if (n === 0x62) saida.push(8);
        else if (n === 0x66) saida.push(12);
        else if (n === 0x0d) {
          if (d[this.pos] === 0x0a) this.pos++;
        } else if (n === 0x0a) {
          // quebra de linha escapada: some
        } else if (n >= 0x30 && n <= 0x37) {
          let valor = n - 0x30;
          for (let k = 0; k < 2 && d[this.pos] >= 0x30 && d[this.pos] <= 0x37; k++) valor = valor * 8 + (d[this.pos++] - 0x30);
          saida.push(valor & 0xff);
        } else if (n !== undefined) saida.push(n);
      } else if (c === 0x28) {
        nivel++;
        saida.push(c);
      } else if (c === 0x29) {
        nivel--;
        if (nivel === 0) break;
        saida.push(c);
      } else saida.push(c);
    }
    return Uint8Array.from(saida);
  }

  private textoHex(): Uint8Array {
    this.pos++;
    const digitos: number[] = [];
    while (this.pos < this.d.length && this.d[this.pos] !== 0x3e) {
      const v = valorHex(this.d[this.pos++]);
      if (v >= 0) digitos.push(v);
    }
    this.pos++;
    if (digitos.length % 2) digitos.push(0);
    const saida = new Uint8Array(digitos.length / 2);
    for (let i = 0; i < saida.length; i++) saida[i] = digitos[2 * i] * 16 + digitos[2 * i + 1];
    return saida;
  }

  /** Pula a imagem dentro do conteúdo (BI ... ID dados EI). */
  pularImagemEmbutida(): void {
    const d = this.d;
    while (this.pos < d.length - 1 && !(d[this.pos] === 0x49 && d[this.pos + 1] === 0x44 && ESPACO.has(d[this.pos + 2] ?? 32))) this.pos++;
    this.pos += 3;
    while (this.pos < d.length - 1) {
      if (ESPACO.has(d[this.pos - 1]) && d[this.pos] === 0x45 && d[this.pos + 1] === 0x49 && ESPACO.has(d[this.pos + 2] ?? 32)) {
        this.pos += 2;
        return;
      }
      this.pos++;
    }
  }
}

/** O que as fontes precisam do documento: seguir referências e abrir fluxos. */
export interface DocumentoParaFontes {
  resolver(valor: Valor | null | undefined): Valor | null;
  dadosDoFluxo(fluxo: Fluxo): Uint8Array | null;
}
