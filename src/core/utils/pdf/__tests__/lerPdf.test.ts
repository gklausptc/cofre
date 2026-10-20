import { describe, expect, it } from '@jest/globals';
import { zlibSync } from 'fflate';
import { md5, rc4 } from '@/core/utils/pdf/criptografia';
import { ehPdf, lerTextoDoPdf, montarLinhas } from '@/core/utils/pdf/lerPdf';

const bytesDe = (texto: string) => Uint8Array.from(texto, (c) => c.charCodeAt(0) & 0xff);
const juntar = (...partes: Uint8Array[]) => {
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
};
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

type Objeto = string | { dic: string; fluxo: Uint8Array };

/** PDF mínimo: objetos numerados a partir de 1 e o trailer (o leitor acha os objetos sem a tabela xref). */
function montarPdf(objetos: Objeto[], trailer: string): Uint8Array {
  const partes: Uint8Array[] = [bytesDe('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  objetos.forEach((obj, i) => {
    if (typeof obj === 'string') partes.push(bytesDe(`${i + 1} 0 obj\n${obj}\nendobj\n`));
    else {
      partes.push(bytesDe(`${i + 1} 0 obj\n<< ${obj.dic} /Length ${obj.fluxo.length} >>\nstream\n`), obj.fluxo, bytesDe('\nendstream\nendobj\n'));
    }
  });
  partes.push(bytesDe(`trailer\n${trailer}\n%%EOF\n`));
  return juntar(...partes);
}

const CONTEUDO = [
  'BT /F1 10 Tf 1 0 0 1 25 783 Tm (Cliente: FULANO DE TAL) Tj ET',
  'BT /F1 10 Tf 1 0 0 1 30 700 Tm (01/10/2026) Tj ET',
  'BT /F1 10 Tf 1 0 0 1 265 700 Tm (Pix - Enviado Jos\\351) Tj ET',
  'BT /F1 10 Tf 1 0 0 1 530 700 Tm [(100,00) -250 (\\(-\\))] TJ ET',
  'BT /F1 10 Tf 12 TL 30 650 Td (Primeira) Tj T* (Segunda) Tj ET',
].join('\n');

function objetosBasicos(conteudo: Objeto): Objeto[] {
  return [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>',
    conteudo,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
}

describe('lerTextoDoPdf', () => {
  it('lê o texto em linhas, com acento WinAnsi, recursos herdados e espaço do TJ', () => {
    const pdf = montarPdf(objetosBasicos({ dic: '', fluxo: bytesDe(CONTEUDO) }), '<< /Root 1 0 R /Size 6 >>');
    expect(ehPdf(pdf)).toBe(true);
    const r = lerTextoDoPdf(pdf);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paginas).toHaveLength(1);
    expect(r.paginas[0].map((l) => l.texto)).toEqual([
      'Cliente: FULANO DE TAL',
      '01/10/2026 Pix - Enviado José 100,00 (-)',
      'Primeira',
      'Segunda',
    ]);
    expect(r.paginas[0][1].pedacos.map((p) => Math.round(p.x))).toEqual([30, 265, 530]);
  });

  it('descompacta FlateDecode e usa o ToUnicode da fonte', () => {
    const cmap = [
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
      '1 begincodespacerange <00> <FF> endcodespacerange',
      '2 beginbfchar <01> <0041> <02> <00E7> endbfchar',
      '1 beginbfrange <03> <05> <0062> endbfrange',
      'endcmap end end',
    ].join('\n');
    const conteudo = 'BT /F1 12 Tf 100 500 Td <0102030405> Tj ET';
    const objetos: Objeto[] = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      { dic: '/Filter /FlateDecode', fluxo: zlibSync(bytesDe(conteudo)) },
      '<< /Type /Font /Subtype /TrueType /BaseFont /Qualquer /FirstChar 1 /Widths [600 600 600 600 600] /ToUnicode 6 0 R >>',
      { dic: '', fluxo: bytesDe(cmap) },
    ];
    const r = lerTextoDoPdf(montarPdf(objetos, '<< /Root 1 0 R >>'));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paginas[0].map((l) => l.texto)).toEqual(['Açbcd']);
  });

  it('PDF protegido por senha (RC4 de 128 bits): pede a senha, recusa a errada e abre com a certa', () => {
    const PAD = Uint8Array.from([
      0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0,
      0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
    ]);
    const preencher = (senha: string) => juntar(bytesDe(senha), PAD).subarray(0, 32);
    const id = bytesDe('0123456789abcdef');
    const p = -1836;
    // Algoritmo 3 (O), com a senha do dono "dono"
    let chaveDono = md5(preencher('dono'));
    for (let i = 0; i < 50; i++) chaveDono = md5(chaveDono);
    let o = rc4(chaveDono, preencher('123456'));
    for (let i = 1; i <= 19; i++) o = rc4(chaveDono.map((b) => b ^ i), o);
    // Algoritmo 2 (chave do arquivo) e 5 (U)
    const pBytes = Uint8Array.from([p & 255, (p >>> 8) & 255, (p >>> 16) & 255, (p >>> 24) & 255]);
    let chave = md5(juntar(preencher('123456'), o, pBytes, id));
    for (let i = 0; i < 50; i++) chave = md5(chave);
    let u = rc4(chave, md5(juntar(PAD, id)));
    for (let i = 1; i <= 19; i++) u = rc4(chave.map((b) => b ^ i), u);
    const uCompleto = juntar(u, new Uint8Array(16));
    // conteúdo da página (objeto 4) cifrado com a chave do objeto
    const chaveDoObjeto = md5(juntar(chave, Uint8Array.from([4, 0, 0, 0, 0]))).subarray(0, 16);
    const conteudo = rc4(chaveDoObjeto, bytesDe('BT /F1 10 Tf 50 700 Td (Fatura protegida) Tj ET'));
    const objetos: Objeto[] = [
      ...objetosBasicos({ dic: '', fluxo: conteudo }),
      `<< /Filter /Standard /V 2 /R 3 /Length 128 /P ${p} /O <${hex(o)}> /U <${hex(uCompleto)}> >>`,
    ];
    const pdf = montarPdf(objetos, `<< /Root 1 0 R /Encrypt 6 0 R /ID [<${hex(id)}> <${hex(id)}>] >>`);

    expect(lerTextoDoPdf(pdf)).toEqual({ ok: false, motivo: 'precisa_senha' });
    expect(lerTextoDoPdf(pdf, '000000')).toEqual({ ok: false, motivo: 'senha_errada' });
    const certo = lerTextoDoPdf(pdf, '123456');
    if (!certo.ok) throw new Error(certo.motivo);
    expect(certo.paginas[0].map((l) => l.texto)).toEqual(['Fatura protegida']);
    // a senha do dono também abre
    const comDono = lerTextoDoPdf(pdf, 'dono');
    expect(comDono.ok && comDono.paginas[0][0].texto).toBe('Fatura protegida');
  });

  it('o que não é PDF', () => {
    expect(lerTextoDoPdf(bytesDe('Data;Valor\n01/10/2026;10,00'))).toEqual({ ok: false, motivo: 'invalido' });
  });
});

describe('montarLinhas', () => {
  /** Texto desenhado letra por letra (como a InfinitePay faz): 5 de largura, espaço de 2,5. */
  function letraPorLetra(x: number, y: number, texto: string) {
    const pedacos: { x: number; y: number; xFim: number; texto: string; tamanho: number }[] = [];
    let pos = x;
    for (const letra of texto) {
      if (letra === ' ') {
        pos += 2.5;
        continue;
      }
      pedacos.push({ x: pos, y, xFim: pos + 5, texto: letra, tamanho: 10 });
      pos += 5;
    }
    return pedacos;
  }

  it('junta letras e palavras da mesma célula, separa as colunas', () => {
    const linhas = montarLinhas([
      ...letraPorLetra(13, 400, '05 Mai, 2026'),
      ...letraPorLetra(97, 400, '14:09'),
      ...letraPorLetra(164, 400, 'Tipo de transação'),
      ...letraPorLetra(299, 400, 'Pix FULANO DE TAL'),
      ...letraPorLetra(800, 400, '+ 20,00'),
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].texto).toBe('05 Mai, 2026 14:09 Tipo de transação Pix FULANO DE TAL + 20,00');
    expect(linhas[0].pedacos.map((p) => [p.x, p.texto])).toEqual([
      [13, '05 Mai, 2026'],
      [97, '14:09'],
      [164, 'Tipo de transação'],
      [299, 'Pix FULANO DE TAL'],
      [800, '+ 20,00'],
    ]);
  });

  it('pedaços que já vêm por célula continuam como estão', () => {
    const linhas = montarLinhas([
      { x: 30, y: 500, xFim: 80, texto: '01/10/2026', tamanho: 9 },
      { x: 99, y: 500, xFim: 124, texto: '99008', tamanho: 9 },
      { x: 265, y: 500, xFim: 360, texto: 'Compra com Cartão', tamanho: 9 },
      { x: 532, y: 500, xFim: 560, texto: '100,00 ', tamanho: 9 },
      { x: 562, y: 500, xFim: 574, texto: '(-)', tamanho: 9 },
    ]);
    expect(linhas[0].pedacos.map((p) => p.texto)).toEqual(['01/10/2026', '99008', 'Compra com Cartão', '100,00 (-)']);
  });
});
