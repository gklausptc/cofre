/**
 * SHA-256, SHA-384 e SHA-512 em JS puro, para abrir PDF com AES-256 (revisão 6 do "Standard
 * security handler", que mistura os três). As constantes são calculadas na primeira chamada
 * (raízes quadradas e cúbicas dos primeiros primos), em vez de 160 números digitados à mão.
 */

const PRIMOS: number[] = (() => {
  const lista: number[] = [];
  for (let n = 2; lista.length < 80; n++) if (lista.every((p) => n % p !== 0)) lista.push(n);
  return lista;
})();

/** x elevado a k, multiplicando (o operador ** pode virar Math.pow no Babel, que não aceita BigInt). */
function potencia(x: bigint, k: number): bigint {
  let resultado = BigInt(1);
  for (let i = 0; i < k; i++) resultado *= x;
  return resultado;
}

/** Raiz inteira k-ésima (piso) de um BigInt, por Newton. */
function raizInteira(n: bigint, k: number): bigint {
  const K = BigInt(k);
  const UM = BigInt(1);
  let x = BigInt(Math.floor(Math.pow(Number(n), 1 / k)));
  for (let i = 0; i < 100; i++) {
    const proximo = ((K - UM) * x + n / potencia(x, k - 1)) / K;
    if (proximo === x) break;
    x = proximo;
  }
  while (potencia(x, k) > n) x -= UM;
  while (potencia(x + UM, k) <= n) x += UM;
  return x;
}

/** Os `bits` primeiros bits da parte fracionária da raiz k-ésima de p. */
function fracaoDaRaiz(p: number, k: number, bits: number): bigint {
  const escala = BigInt(bits * k);
  const raiz = raizInteira(BigInt(p) << escala, k);
  return raiz & ((BigInt(1) << BigInt(bits)) - BigInt(1));
}

let constantes32: { k: Uint32Array; h256: Uint32Array } | null = null;
let constantes64: { k: Int32Array; h512: Int32Array; h384: Int32Array } | null = null;

function de32(): { k: Uint32Array; h256: Uint32Array } {
  if (!constantes32) {
    constantes32 = {
      k: Uint32Array.from(PRIMOS.slice(0, 64), (p) => Number(fracaoDaRaiz(p, 3, 32))),
      h256: Uint32Array.from(PRIMOS.slice(0, 8), (p) => Number(fracaoDaRaiz(p, 2, 32))),
    };
  }
  return constantes32;
}

/** Pares (alto, baixo) de 32 bits. */
function paraPares(valores: bigint[]): Int32Array {
  const saida = new Int32Array(valores.length * 2);
  const mascara = BigInt(0xffffffff);
  valores.forEach((v, i) => {
    saida[2 * i] = Number((v >> BigInt(32)) & mascara) | 0;
    saida[2 * i + 1] = Number(v & mascara) | 0;
  });
  return saida;
}

function de64(): { k: Int32Array; h512: Int32Array; h384: Int32Array } {
  if (!constantes64) {
    constantes64 = {
      k: paraPares(PRIMOS.slice(0, 80).map((p) => fracaoDaRaiz(p, 3, 64))),
      h512: paraPares(PRIMOS.slice(0, 8).map((p) => fracaoDaRaiz(p, 2, 64))),
      h384: paraPares(PRIMOS.slice(8, 16).map((p) => fracaoDaRaiz(p, 2, 64))),
    };
  }
  return constantes64;
}

function preencher(dados: Uint8Array, bloco: number, tamanhoDoComprimento: number): { buffer: Uint8Array; visao: DataView } {
  const total = Math.ceil((dados.length + 1 + tamanhoDoComprimento) / bloco) * bloco;
  const buffer = new Uint8Array(total);
  buffer.set(dados);
  buffer[dados.length] = 0x80;
  const visao = new DataView(buffer.buffer);
  const bits = dados.length * 8;
  visao.setUint32(total - 4, bits >>> 0);
  visao.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  return { buffer, visao };
}

const rotr32 = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(dados: Uint8Array): Uint8Array {
  const { k, h256 } = de32();
  const { buffer, visao } = preencher(dados, 64, 8);
  const h = Uint32Array.from(h256);
  const w = new Uint32Array(64);
  for (let inicio = 0; inicio < buffer.length; inicio += 64) {
    for (let i = 0; i < 16; i++) w[i] = visao.getUint32(inicio + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + k[i] + w[i]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  const saida = new Uint8Array(32);
  const visaoSaida = new DataView(saida.buffer);
  for (let i = 0; i < 8; i++) visaoSaida.setUint32(i * 4, h[i]);
  return saida;
}

// ---- 64 bits em pares (alto, baixo)

/** Rotação à direita de (alto, baixo) por n (1..63, diferente de 32): devolve [alto, baixo]. */
function rotr64(alto: number, baixo: number, n: number): [number, number] {
  if (n < 32) return [(alto >>> n) | (baixo << (32 - n)), (baixo >>> n) | (alto << (32 - n))];
  const m = n - 32;
  return [(baixo >>> m) | (alto << (32 - m)), (alto >>> m) | (baixo << (32 - m))];
}

function shr64(alto: number, baixo: number, n: number): [number, number] {
  return [alto >>> n, (baixo >>> n) | (alto << (32 - n))];
}

/** Soma de vários pares de 64 bits (mod 2^64). */
function somar64(...pares: [number, number][]): [number, number] {
  let baixo = 0;
  let alto = 0;
  for (const [a, b] of pares) {
    baixo += b >>> 0;
    alto += a >>> 0;
  }
  alto += Math.floor(baixo / 4294967296);
  return [alto | 0, baixo | 0];
}

function sha512Base(dados: Uint8Array, inicial: Int32Array, bytesDeSaida: number): Uint8Array {
  const { k } = de64();
  const { buffer, visao } = preencher(dados, 128, 16);
  const h = Int32Array.from(inicial);
  const w = new Int32Array(160);
  for (let inicio = 0; inicio < buffer.length; inicio += 128) {
    for (let i = 0; i < 32; i++) w[i] = visao.getInt32(inicio + i * 4);
    for (let i = 16; i < 80; i++) {
      const xa = w[(i - 15) * 2];
      const xb = w[(i - 15) * 2 + 1];
      const r1 = rotr64(xa, xb, 1);
      const r8 = rotr64(xa, xb, 8);
      const s7 = shr64(xa, xb, 7);
      const s0: [number, number] = [r1[0] ^ r8[0] ^ s7[0], r1[1] ^ r8[1] ^ s7[1]];
      const ya = w[(i - 2) * 2];
      const yb = w[(i - 2) * 2 + 1];
      const r19 = rotr64(ya, yb, 19);
      const r61 = rotr64(ya, yb, 61);
      const s6 = shr64(ya, yb, 6);
      const s1: [number, number] = [r19[0] ^ r61[0] ^ s6[0], r19[1] ^ r61[1] ^ s6[1]];
      const soma = somar64([w[(i - 16) * 2], w[(i - 16) * 2 + 1]], s0, [w[(i - 7) * 2], w[(i - 7) * 2 + 1]], s1);
      w[i * 2] = soma[0];
      w[i * 2 + 1] = soma[1];
    }
    const v = Array.from({ length: 8 }, (_, i): [number, number] => [h[i * 2], h[i * 2 + 1]]);
    let [a, b, c, d, e, f, g, hh] = v;
    for (let i = 0; i < 80; i++) {
      const e14 = rotr64(e[0], e[1], 14);
      const e18 = rotr64(e[0], e[1], 18);
      const e41 = rotr64(e[0], e[1], 41);
      const S1: [number, number] = [e14[0] ^ e18[0] ^ e41[0], e14[1] ^ e18[1] ^ e41[1]];
      const ch: [number, number] = [(e[0] & f[0]) ^ (~e[0] & g[0]), (e[1] & f[1]) ^ (~e[1] & g[1])];
      const t1 = somar64(hh, S1, ch, [k[i * 2], k[i * 2 + 1]], [w[i * 2], w[i * 2 + 1]]);
      const a28 = rotr64(a[0], a[1], 28);
      const a34 = rotr64(a[0], a[1], 34);
      const a39 = rotr64(a[0], a[1], 39);
      const S0: [number, number] = [a28[0] ^ a34[0] ^ a39[0], a28[1] ^ a34[1] ^ a39[1]];
      const maj: [number, number] = [
        (a[0] & b[0]) ^ (a[0] & c[0]) ^ (b[0] & c[0]),
        (a[1] & b[1]) ^ (a[1] & c[1]) ^ (b[1] & c[1]),
      ];
      const t2 = somar64(S0, maj);
      hh = g;
      g = f;
      f = e;
      e = somar64(d, t1);
      d = c;
      c = b;
      b = a;
      a = somar64(t1, t2);
    }
    [a, b, c, d, e, f, g, hh].forEach((par, i) => {
      const soma = somar64([h[i * 2], h[i * 2 + 1]], par);
      h[i * 2] = soma[0];
      h[i * 2 + 1] = soma[1];
    });
  }
  const saida = new Uint8Array(64);
  const visaoSaida = new DataView(saida.buffer);
  for (let i = 0; i < 16; i++) visaoSaida.setInt32(i * 4, h[i]);
  return saida.slice(0, bytesDeSaida);
}

export function sha512(dados: Uint8Array): Uint8Array {
  return sha512Base(dados, de64().h512, 64);
}

export function sha384(dados: Uint8Array): Uint8Array {
  return sha512Base(dados, de64().h384, 48);
}
