import { describe, expect, it } from '@jest/globals';
import { sha256, sha384, sha512 } from '@/core/utils/pdf/hash';

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const ascii = (texto: string) => Uint8Array.from(texto, (c) => c.charCodeAt(0));

describe('sha2', () => {
  it('vetores do NIST', () => {
    expect(hex(sha256(ascii('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(ascii('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
    expect(hex(sha512(ascii('abc')))).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
    );
    expect(hex(sha384(ascii('abc')))).toBe('cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7');
    // dois blocos
    expect(hex(sha512(ascii('a'.repeat(200))))).toBe(
      '4b11459c33f52a22ee8236782714c150a3b2c60994e9acee17fe68947a3e6789f31e7668394592da7bef827cddca88c4e6f86e4df7ed1ae6cba71f3e98faee9f'
    );
  });
});
