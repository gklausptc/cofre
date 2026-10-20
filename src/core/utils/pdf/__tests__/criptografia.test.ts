import { describe, expect, it } from '@jest/globals';
import {
  aesCbcCifrarSemPreenchimento,
  aesCbcDecifrar,
  aesCbcDecifrarSemPreenchimento,
  aesCifrarBloco,
  aesDecifrarBloco,
  md5,
  rc4,
} from '@/core/utils/pdf/criptografia';

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (texto: string) => Uint8Array.from(texto.match(/../g) ?? [], (h) => parseInt(h, 16));
const ascii = (texto: string) => Uint8Array.from(texto, (c) => c.charCodeAt(0));

describe('md5', () => {
  it('vetores da RFC 1321', () => {
    expect(hex(md5(ascii('')))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hex(md5(ascii('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(hex(md5(ascii('message digest')))).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(hex(md5(ascii('12345678901234567890123456789012345678901234567890123456789012345678901234567890')))).toBe(
      '57edf4a22be3c955ac49da2e2107b67a'
    );
  });
});

describe('rc4', () => {
  it('vetor conhecido', () => {
    expect(hex(rc4(ascii('Key'), ascii('Plaintext')))).toBe('bbf316e8d940af0ad3');
    expect(hex(rc4(ascii('Secret'), ascii('Attack at dawn')))).toBe('45a01f645fc35b383552544b9bf5');
  });
});

describe('aes', () => {
  it('FIPS-197: AES-128 e AES-256', () => {
    expect(hex(aesDecifrarBloco(deHex('000102030405060708090a0b0c0d0e0f'), deHex('69c4e0d86a7b0430d8cdb78070b4c55a')))).toBe(
      '00112233445566778899aabbccddeeff'
    );
    expect(
      hex(
        aesDecifrarBloco(
          deHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
          deHex('8ea2b7ca516745bfeafc49904b496089')
        )
      )
    ).toBe('00112233445566778899aabbccddeeff');
  });

  it('CBC do NIST SP 800-38A, com o vetor inicial na frente', () => {
    const chave = deHex('2b7e151628aed2a6abf7158809cf4f3c');
    const dados = deHex('000102030405060708090a0b0c0d0e0f' + '7649abac8119b246cee98e9b12e9197d' + '5086cb9b507219ee95db113a917678b2');
    expect(hex(aesCbcDecifrar(chave, dados))).toBe('6bc1bee22e409f96e93d7e117393172a' + 'ae2d8a571e03ac9c9eb76fac45af8e51');
  });
});

describe('aes para cifrar', () => {
  it('FIPS-197 e ida e volta no CBC', () => {
    expect(hex(aesCifrarBloco(deHex('000102030405060708090a0b0c0d0e0f'), deHex('00112233445566778899aabbccddeeff')))).toBe(
      '69c4e0d86a7b0430d8cdb78070b4c55a'
    );
    // NIST SP 800-38A F.2.1 (CBC-AES128.Encrypt)
    const chave = deHex('2b7e151628aed2a6abf7158809cf4f3c');
    const iv = deHex('000102030405060708090a0b0c0d0e0f');
    const claro = deHex('6bc1bee22e409f96e93d7e117393172a' + 'ae2d8a571e03ac9c9eb76fac45af8e51');
    const cifrado = aesCbcCifrarSemPreenchimento(chave, iv, claro);
    expect(hex(cifrado)).toBe('7649abac8119b246cee98e9b12e9197d' + '5086cb9b507219ee95db113a917678b2');
    expect(hex(aesCbcDecifrarSemPreenchimento(chave, iv, cifrado))).toBe(hex(claro));
  });
});
