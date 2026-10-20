/**
 * MD5, RC4 e AES (decifrar, modo CBC) em JS puro, para abrir PDF protegido por senha (o
 * "Standard security handler"). Nada aqui é usado para proteger dados do app: é só o que o
 * formato PDF exige para ler o arquivo que o banco mandou.
 */

const DESLOCAMENTOS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16,
  23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const CONSTANTES = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(dados: Uint8Array): Uint8Array {
  const tamanho = dados.length;
  const total = (((tamanho + 8) >>> 6) + 1) * 64;
  const bloco = new Uint8Array(total);
  bloco.set(dados);
  bloco[tamanho] = 0x80;
  const visao = new DataView(bloco.buffer);
  const bits = tamanho * 8;
  visao.setUint32(total - 8, bits >>> 0, true);
  visao.setUint32(total - 4, Math.floor(bits / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let inicio = 0; inicio < total; inicio += 64) {
    for (let i = 0; i < 16; i++) m[i] = visao.getUint32(inicio + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + CONSTANTES[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((f << DESLOCAMENTOS[i]) | (f >>> (32 - DESLOCAMENTOS[i])))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const saida = new Uint8Array(16);
  const visaoSaida = new DataView(saida.buffer);
  visaoSaida.setUint32(0, a0, true);
  visaoSaida.setUint32(4, b0, true);
  visaoSaida.setUint32(8, c0, true);
  visaoSaida.setUint32(12, d0, true);
  return saida;
}

export function rc4(chave: Uint8Array, dados: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + chave[i % chave.length]) & 255;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
  }
  const saida = new Uint8Array(dados.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < dados.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
    saida[k] = dados[k] ^ s[(s[i] + s[j]) & 255];
  }
  return saida;
}

// ---------------------------------------------------------------- AES

const SBOX = new Uint8Array(256);
const SBOX_INVERSA = new Uint8Array(256);
(function gerarSbox() {
  const rotacionar = (x: number, n: number) => ((x << n) | (x >> (8 - n))) & 0xff;
  let p = 1;
  let q = 1;
  do {
    // p vezes 3, q dividido por 3 no GF(2^8)
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 0xff;
    q = (q ^ (q << 1)) & 0xff;
    q = (q ^ (q << 2)) & 0xff;
    q = (q ^ (q << 4)) & 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ rotacionar(q, 1) ^ rotacionar(q, 2) ^ rotacionar(q, 3) ^ rotacionar(q, 4);
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) SBOX_INVERSA[SBOX[i]] = i;
})();

function multiplicar(a: number, b: number): number {
  let resultado = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) resultado ^= x;
    x = (x << 1) ^ (x & 0x80 ? 0x1b : 0);
    x &= 0xff;
    y >>= 1;
  }
  return resultado;
}

function expandirChave(chave: Uint8Array): { w: Uint8Array; rodadas: number } {
  const nk = chave.length / 4;
  const rodadas = nk + 6;
  const palavras = 4 * (rodadas + 1);
  const w = new Uint8Array(palavras * 4);
  w.set(chave);
  let rcon = 1;
  for (let i = nk; i < palavras; i++) {
    let t0 = w[(i - 1) * 4];
    let t1 = w[(i - 1) * 4 + 1];
    let t2 = w[(i - 1) * 4 + 2];
    let t3 = w[(i - 1) * 4 + 3];
    if (i % nk === 0) {
      const primeiro = t0;
      t0 = SBOX[t1] ^ rcon;
      t1 = SBOX[t2];
      t2 = SBOX[t3];
      t3 = SBOX[primeiro];
      rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x1b : 0)) & 0xff;
    } else if (nk > 6 && i % nk === 4) {
      t0 = SBOX[t0];
      t1 = SBOX[t1];
      t2 = SBOX[t2];
      t3 = SBOX[t3];
    }
    w[i * 4] = w[(i - nk) * 4] ^ t0;
    w[i * 4 + 1] = w[(i - nk) * 4 + 1] ^ t1;
    w[i * 4 + 2] = w[(i - nk) * 4 + 2] ^ t2;
    w[i * 4 + 3] = w[(i - nk) * 4 + 3] ^ t3;
  }
  return { w, rodadas };
}

function decifrarBloco(w: Uint8Array, rodadas: number, bloco: Uint8Array): Uint8Array {
  const s = bloco.slice(0, 16);
  const somarChave = (rodada: number) => {
    for (let i = 0; i < 16; i++) s[i] ^= w[rodada * 16 + i];
  };
  const desfazerDeslocamento = () => {
    const copia = s.slice();
    for (let linha = 1; linha < 4; linha++) {
      for (let coluna = 0; coluna < 4; coluna++) s[linha + 4 * coluna] = copia[linha + 4 * ((coluna - linha + 4) % 4)];
    }
  };
  const desfazerSubstituicao = () => {
    for (let i = 0; i < 16; i++) s[i] = SBOX_INVERSA[s[i]];
  };
  const desfazerMistura = () => {
    for (let c = 0; c < 4; c++) {
      const [a0, a1, a2, a3] = [s[4 * c], s[4 * c + 1], s[4 * c + 2], s[4 * c + 3]];
      s[4 * c] = multiplicar(a0, 14) ^ multiplicar(a1, 11) ^ multiplicar(a2, 13) ^ multiplicar(a3, 9);
      s[4 * c + 1] = multiplicar(a0, 9) ^ multiplicar(a1, 14) ^ multiplicar(a2, 11) ^ multiplicar(a3, 13);
      s[4 * c + 2] = multiplicar(a0, 13) ^ multiplicar(a1, 9) ^ multiplicar(a2, 14) ^ multiplicar(a3, 11);
      s[4 * c + 3] = multiplicar(a0, 11) ^ multiplicar(a1, 13) ^ multiplicar(a2, 9) ^ multiplicar(a3, 14);
    }
  };
  somarChave(rodadas);
  for (let rodada = rodadas - 1; rodada >= 1; rodada--) {
    desfazerDeslocamento();
    desfazerSubstituicao();
    somarChave(rodada);
    desfazerMistura();
  }
  desfazerDeslocamento();
  desfazerSubstituicao();
  somarChave(0);
  return s;
}

/** Bloco único, sem modo nem preenchimento (para testar com os vetores do FIPS-197). */
export function aesDecifrarBloco(chave: Uint8Array, bloco: Uint8Array): Uint8Array {
  const { w, rodadas } = expandirChave(chave);
  return decifrarBloco(w, rodadas, bloco);
}

/** AES-CBC com o vetor inicial nos 16 primeiros bytes e preenchimento PKCS#5 (como no PDF). */
export function aesCbcDecifrar(chave: Uint8Array, dados: Uint8Array): Uint8Array {
  if (dados.length < 32 || dados.length % 16 !== 0) return new Uint8Array(0);
  const { w, rodadas } = expandirChave(chave);
  const saida = new Uint8Array(dados.length - 16);
  let anterior = dados.subarray(0, 16);
  for (let inicio = 16; inicio < dados.length; inicio += 16) {
    const bloco = dados.subarray(inicio, inicio + 16);
    const claro = decifrarBloco(w, rodadas, bloco);
    for (let i = 0; i < 16; i++) saida[inicio - 16 + i] = claro[i] ^ anterior[i];
    anterior = bloco;
  }
  const preenchimento = saida[saida.length - 1];
  return preenchimento >= 1 && preenchimento <= 16 ? saida.subarray(0, saida.length - preenchimento) : saida;
}
