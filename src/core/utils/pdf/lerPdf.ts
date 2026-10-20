import { Inflate, unzlibSync } from 'fflate';
import { aesCbcDecifrar, md5, rc4 } from './criptografia';
import { criarFonte, type Fonte } from './fontes';
import {
  ESPACO,
  Leitor,
  ehBytes,
  ehDic,
  ehFluxo,
  ehLista,
  ehNome,
  ehOperador,
  ehRef,
  latin1,
  valorHex,
  type Dic,
  type Fluxo,
  type Valor,
} from './sintaxe';


/**
 * Leitor de PDF em JS puro (funciona no Expo Go): acha os objetos do arquivo, abre a proteção
 * por senha do "Standard security handler" (RC4 e AES-128), descompacta os conteúdos das
 * páginas e devolve o texto em linhas, com a posição de cada pedaço. Só o necessário para
 * ler extratos e faturas gerados por sistema — PDF escaneado (imagem) não tem texto.
 */

// ---------------------------------------------------------------- filtros

function inflar(dados: Uint8Array): Uint8Array {
  try {
    return unzlibSync(dados);
  } catch {
    // fluxo cortado ou com lixo no fim: aproveita o que der
    const partes: Uint8Array[] = [];
    try {
      const inflate = new Inflate((parte) => partes.push(parte));
      inflate.push(dados.subarray(2), true);
    } catch {
      // fica com o que saiu até o erro
    }
    const total = partes.reduce((s, p) => s + p.length, 0);
    const saida = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) {
      saida.set(p, pos);
      pos += p.length;
    }
    return saida;
  }
}

function desfazerPreditor(dados: Uint8Array, parametros: Dic | null): Uint8Array {
  const numero = (chave: string, padrao: number) => {
    const v = parametros?.v.get(chave);
    return typeof v === 'number' ? v : padrao;
  };
  if (numero('Predictor', 1) < 10) return dados;
  const cores = numero('Colors', 1);
  const bits = numero('BitsPerComponent', 8);
  const colunas = numero('Columns', 1);
  const bpp = Math.max(1, Math.ceil((cores * bits) / 8));
  const largura = Math.ceil((colunas * cores * bits) / 8);
  const linhas = Math.floor(dados.length / (largura + 1));
  const saida = new Uint8Array(linhas * largura);
  let anterior = new Uint8Array(largura);
  for (let r = 0; r < linhas; r++) {
    const tipo = dados[r * (largura + 1)];
    const atual = dados.subarray(r * (largura + 1) + 1, (r + 1) * (largura + 1));
    const linha = saida.subarray(r * largura, (r + 1) * largura);
    for (let i = 0; i < largura; i++) {
      const esquerda = i >= bpp ? linha[i - bpp] : 0;
      const cima = anterior[i];
      const diagonal = i >= bpp ? anterior[i - bpp] : 0;
      let v = atual[i];
      if (tipo === 1) v += esquerda;
      else if (tipo === 2) v += cima;
      else if (tipo === 3) v += (esquerda + cima) >> 1;
      else if (tipo === 4) {
        const p = esquerda + cima - diagonal;
        const pa = Math.abs(p - esquerda);
        const pb = Math.abs(p - cima);
        const pc = Math.abs(p - diagonal);
        v += pa <= pb && pa <= pc ? esquerda : pb <= pc ? cima : diagonal;
      }
      linha[i] = v & 0xff;
    }
    anterior = linha;
  }
  return saida;
}

function asciiHex(dados: Uint8Array): Uint8Array {
  const digitos: number[] = [];
  for (const c of dados) {
    if (c === 0x3e) break;
    const v = valorHex(c);
    if (v >= 0) digitos.push(v);
  }
  if (digitos.length % 2) digitos.push(0);
  return Uint8Array.from({ length: digitos.length / 2 }, (_, i) => digitos[2 * i] * 16 + digitos[2 * i + 1]);
}

function ascii85(dados: Uint8Array): Uint8Array {
  const saida: number[] = [];
  let grupo: number[] = [];
  for (const c of dados) {
    if (c === 0x7e) break;
    if (ESPACO.has(c)) continue;
    if (c === 0x7a && grupo.length === 0) {
      saida.push(0, 0, 0, 0);
      continue;
    }
    grupo.push(c - 33);
    if (grupo.length === 5) {
      const n = grupo.reduce((s, v) => s * 85 + v, 0);
      saida.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      grupo = [];
    }
  }
  if (grupo.length > 1) {
    const faltam = 5 - grupo.length;
    const n = [...grupo, ...Array(faltam).fill(84)].reduce((s: number, v: number) => s * 85 + v, 0);
    const bytes = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    saida.push(...bytes.slice(0, 4 - faltam));
  }
  return Uint8Array.from(saida);
}

// ---------------------------------------------------------------- proteção por senha

const PREENCHIMENTO = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68,
  0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function juntar(...partes: Uint8Array[]): Uint8Array {
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

function senhaPreenchida(senha: Uint8Array): Uint8Array {
  return juntar(senha.subarray(0, 32), PREENCHIMENTO).subarray(0, 32);
}

type Metodo = 'rc4' | 'aes' | 'nenhum';
type Protecao = { chave: Uint8Array; fluxos: Metodo; textos: Metodo };
type ParametrosProtecao = { r: number; tamanho: number; o: Uint8Array; u: Uint8Array; p: number; id: Uint8Array; metadados: boolean };

/** Algoritmo 2 da especificação: a chave do arquivo a partir da senha do usuário. */
function chaveDoArquivo(senha: Uint8Array, prm: ParametrosProtecao): Uint8Array {
  const p = prm.p >>> 0;
  const partes = [senhaPreenchida(senha), prm.o.subarray(0, 32), Uint8Array.from([p & 255, (p >>> 8) & 255, (p >>> 16) & 255, (p >>> 24) & 255]), prm.id];
  if (prm.r >= 4 && !prm.metadados) partes.push(Uint8Array.from([255, 255, 255, 255]));
  let hash = md5(juntar(...partes));
  if (prm.r >= 3) for (let i = 0; i < 50; i++) hash = md5(hash.subarray(0, prm.tamanho));
  return hash.subarray(0, prm.tamanho);
}

function senhaDoUsuarioConfere(chave: Uint8Array, prm: ParametrosProtecao): boolean {
  if (prm.r === 2) {
    const u = rc4(chave, PREENCHIMENTO);
    return u.every((b, i) => b === prm.u[i]);
  }
  let x = rc4(chave, md5(juntar(PREENCHIMENTO, prm.id)));
  for (let i = 1; i <= 19; i++) x = rc4(chave.map((b) => b ^ i), x);
  return x.subarray(0, 16).every((b, i) => b === prm.u[i]);
}

/** Algoritmo 7: com a senha do dono, recupera a do usuário. */
function senhaDoUsuarioPelaDoDono(senhaDono: Uint8Array, prm: ParametrosProtecao): Uint8Array {
  let hash = md5(senhaPreenchida(senhaDono));
  if (prm.r >= 3) for (let i = 0; i < 50; i++) hash = md5(hash);
  const chave = hash.subarray(0, prm.tamanho);
  if (prm.r === 2) return rc4(chave, prm.o.subarray(0, 32));
  let x = prm.o.subarray(0, 32);
  for (let i = 19; i >= 0; i--) x = rc4(chave.map((b) => b ^ i), x);
  return x;
}

// ---------------------------------------------------------------- documento

const OBJETO = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g;

/** Todas as ocorrências (sem matchAll, por compatibilidade com o Hermes). */
function todas(texto: string, padrao: RegExp): RegExpExecArray[] {
  const busca = new RegExp(padrao.source, 'g');
  const achados: RegExpExecArray[] = [];
  for (let achado = busca.exec(texto); achado !== null; achado = busca.exec(texto)) {
    achados.push(achado);
    if (achado[0] === '') busca.lastIndex++;
  }
  return achados;
}

export class DocumentoPdf {
  private readonly texto: string;
  private readonly diretos = new Map<number, { pos: number; gen: number }>();
  private comprimidos: Map<number, { fluxo: number; pos: number }> | null = null;
  private readonly cache = new Map<number, Valor | null>();
  private readonly dadosDeObjStm = new Map<number, Uint8Array>();
  private protecao: Protecao | null = null;
  private numeroDaProtecao: number | null = null;
  readonly trailer: Dic;

  constructor(readonly d: Uint8Array) {
    this.texto = latin1(d);
    for (const achado of todas(this.texto, OBJETO)) {
      const inicio = (achado.index ?? 0) + achado[0].length;
      this.diretos.set(Number(achado[1]), { pos: inicio, gen: Number(achado[2]) });
    }
    this.trailer = this.lerTrailer();
  }

  private lerTrailer(): Dic {
    const juntos = new Map<string, Valor>();
    for (const achado of todas(this.texto, /trailer/g)) {
      const valor = new Leitor(this.d, (achado.index ?? 0) + 7).ler();
      if (valor !== undefined && !ehOperador(valor) && ehDic(valor)) for (const [k, v] of valor.v) juntos.set(k, v);
    }
    if (!juntos.has('Root')) {
      // PDF 1.5 com tabela de referências em fluxo: o "trailer" é o dicionário do fluxo XRef
      for (const achado of todas(this.texto, /\/Type\s*\/XRef\b/g)) {
        const num = this.objetoQueContem(achado.index ?? 0);
        const fluxo = num !== null ? this.objeto(num) : null;
        if (ehFluxo(fluxo)) for (const [k, v] of fluxo.dic.v) if (!juntos.has(k) || k === 'Root') juntos.set(k, v);
      }
    }
    if (!juntos.has('Root')) {
      const achado = /\/Type\s*\/Catalog\b/.exec(this.texto);
      const num = achado ? this.objetoQueContem(achado.index) : null;
      if (num !== null) juntos.set('Root', { t: 'ref', num, gen: 0 });
    }
    return { t: 'dic', v: juntos };
  }

  private objetoQueContem(posicao: number): number | null {
    let melhor: { num: number; pos: number } | null = null;
    for (const [num, { pos }] of this.diretos) if (pos <= posicao && (!melhor || pos > melhor.pos)) melhor = { num, pos };
    return melhor?.num ?? null;
  }

  get protegido(): boolean {
    return this.trailer.v.has('Encrypt');
  }

  /** Abre a proteção com a senha (vazia primeiro). */
  abrir(senha: string): 'ok' | 'senha' | 'nao_suportado' {
    if (!this.protegido) return 'ok';
    const ref = this.trailer.v.get('Encrypt');
    if (ehRef(ref)) this.numeroDaProtecao = ref.num;
    const enc = this.resolver(ref);
    if (!ehDic(enc)) return 'nao_suportado';
    const nome = (k: string) => {
      const v = enc.v.get(k);
      return ehNome(v) ? v.v : null;
    };
    const numero = (k: string, padrao: number) => {
      const v = this.resolver(enc.v.get(k));
      return typeof v === 'number' ? v : padrao;
    };
    const bytes = (k: string) => {
      const v = this.resolver(enc.v.get(k));
      return ehBytes(v) ? v.v : new Uint8Array(0);
    };
    if (nome('Filter') !== 'Standard') return 'nao_suportado';
    const versao = numero('V', 0);
    const r = numero('R', 2);
    if (versao >= 5 || r >= 5) return 'nao_suportado';

    let fluxos: Metodo = 'rc4';
    let textos: Metodo = 'rc4';
    let tamanho = versao === 1 ? 5 : numero('Length', 40) / 8;
    if (versao === 4) {
      const filtros = this.resolver(enc.v.get('CF'));
      const metodoDe = (filtro: string | null): Metodo => {
        if (filtro === 'Identity' || filtro === null) return 'nenhum';
        const cf = ehDic(filtros) ? this.resolver(filtros.v.get(filtro)) : null;
        const cfm = ehDic(cf) ? cf.v.get('CFM') : undefined;
        const tamanhoCf = ehDic(cf) ? cf.v.get('Length') : undefined;
        if (typeof tamanhoCf === 'number') tamanho = tamanhoCf > 32 ? tamanhoCf / 8 : tamanhoCf;
        if (ehNome(cfm) && cfm.v === 'AESV2') return 'aes';
        if (ehNome(cfm) && cfm.v === 'None') return 'nenhum';
        return 'rc4';
      };
      fluxos = metodoDe(nome('StmF'));
      textos = metodoDe(nome('StrF'));
      if (fluxos === 'aes' || textos === 'aes') tamanho = 16;
    }
    const ids = this.resolver(this.trailer.v.get('ID'));
    const primeiroId = ehLista(ids) ? ids.v[0] : undefined;
    const metadados = enc.v.get('EncryptMetadata');
    const prm: ParametrosProtecao = {
      r,
      tamanho: Math.max(5, Math.min(16, Math.round(tamanho))),
      o: bytes('O'),
      u: bytes('U'),
      p: numero('P', 0),
      id: ehBytes(primeiroId) ? primeiroId.v : new Uint8Array(0),
      metadados: metadados !== false,
    };
    const codificar = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
    for (const tentativa of senha === '' ? [''] : ['', senha]) {
      const comoUsuario = chaveDoArquivo(codificar(tentativa), prm);
      if (senhaDoUsuarioConfere(comoUsuario, prm)) {
        this.protecao = { chave: comoUsuario, fluxos, textos };
        this.cache.clear();
        return 'ok';
      }
      const comoDono = chaveDoArquivo(senhaDoUsuarioPelaDoDono(codificar(tentativa), prm), prm);
      if (senhaDoUsuarioConfere(comoDono, prm)) {
        this.protecao = { chave: comoDono, fluxos, textos };
        this.cache.clear();
        return 'ok';
      }
    }
    return 'senha';
  }

  private decifrar(dados: Uint8Array, num: number, gen: number, metodo: Metodo): Uint8Array {
    if (!this.protecao || metodo === 'nenhum' || num === this.numeroDaProtecao) return dados;
    const sufixo = [num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255];
    const sal = metodo === 'aes' ? [0x73, 0x41, 0x6c, 0x54] : [];
    const chave = md5(juntar(this.protecao.chave, Uint8Array.from([...sufixo, ...sal]))).subarray(
      0,
      Math.min(this.protecao.chave.length + 5, 16)
    );
    return metodo === 'aes' ? aesCbcDecifrar(chave, dados) : rc4(chave, dados);
  }

  private decifrarTextos(valor: Valor, num: number, gen: number): Valor {
    if (!this.protecao) return valor;
    if (ehBytes(valor)) return { t: 'texto', v: this.decifrar(valor.v, num, gen, this.protecao.textos) };
    if (ehLista(valor)) return { t: 'lista', v: valor.v.map((v) => this.decifrarTextos(v, num, gen)) };
    if (ehDic(valor)) {
      const v = new Map<string, Valor>();
      for (const [k, item] of valor.v) v.set(k, this.decifrarTextos(item, num, gen));
      return { t: 'dic', v };
    }
    return valor;
  }

  objeto(num: number): Valor | null {
    const guardado = this.cache.get(num);
    if (guardado !== undefined) return guardado;
    this.cache.set(num, null);
    let valor: Valor | null = null;
    const direto = this.diretos.get(num);
    if (direto) valor = this.lerDireto(num, direto.pos, direto.gen);
    else {
      const comprimido = this.indiceDeComprimidos().get(num);
      if (comprimido) {
        const dados = this.dadosDeObjStm.get(comprimido.fluxo);
        const lido = dados ? new Leitor(dados, comprimido.pos).ler() : undefined;
        valor = lido !== undefined && !ehOperador(lido) ? lido : null;
      }
    }
    this.cache.set(num, valor);
    return valor;
  }

  resolver(valor: Valor | null | undefined): Valor | null {
    let atual = valor ?? null;
    for (let i = 0; i < 16 && ehRef(atual); i++) atual = this.objeto(atual.num);
    return ehRef(atual) ? null : atual;
  }

  private lerDireto(num: number, pos: number, gen: number): Valor | null {
    const leitor = new Leitor(this.d, pos);
    const lido = leitor.ler();
    if (lido === undefined || ehOperador(lido)) return null;
    if (!ehDic(lido)) return this.decifrarTextos(lido, num, gen);
    leitor.pularEspacos();
    if (latin1(this.d, leitor.pos, leitor.pos + 6) !== 'stream') return this.decifrarTextos(lido, num, gen);
    let inicio = leitor.pos + 6;
    if (this.d[inicio] === 13) inicio++;
    if (this.d[inicio] === 10) inicio++;
    const tamanho = this.resolver(lido.v.get('Length'));
    let fim = typeof tamanho === 'number' ? inicio + tamanho : -1;
    const confere = fim > 0 && fim <= this.d.length && /^\s*endstream/.test(latin1(this.d, fim, Math.min(this.d.length, fim + 20)));
    if (!confere) {
      const achado = this.texto.indexOf('endstream', inicio);
      fim = achado < 0 ? this.d.length : achado;
      if (this.d[fim - 1] === 10) fim--;
      if (this.d[fim - 1] === 13) fim--;
    }
    const dic = this.decifrarTextos(lido, num, gen);
    const tipo = lido.v.get('Type');
    const ehXref = ehNome(tipo) && tipo.v === 'XRef';
    const bruto = this.d.subarray(inicio, Math.max(inicio, fim));
    return {
      t: 'fluxo',
      dic: ehDic(dic) ? dic : lido,
      v: ehXref || !this.protecao ? bruto : this.decifrar(bruto, num, gen, this.protecao.fluxos),
    };
  }

  /** Objetos guardados dentro de fluxos /ObjStm (PDF 1.5+). */
  private indiceDeComprimidos(): Map<number, { fluxo: number; pos: number }> {
    if (this.comprimidos) return this.comprimidos;
    const indice = new Map<number, { fluxo: number; pos: number }>();
    this.comprimidos = indice;
    for (const achado of todas(this.texto, /\/Type\s*\/ObjStm\b/g)) {
      const num = this.objetoQueContem(achado.index ?? 0);
      const fluxo = num !== null ? this.objeto(num) : null;
      if (num === null || !ehFluxo(fluxo)) continue;
      const dados = this.dadosDoFluxo(fluxo);
      const quantidade = fluxo.dic.v.get('N');
      const primeiro = fluxo.dic.v.get('First');
      if (!dados || typeof quantidade !== 'number' || typeof primeiro !== 'number') continue;
      this.dadosDeObjStm.set(num, dados);
      const leitor = new Leitor(dados, 0);
      for (let i = 0; i < quantidade; i++) {
        const objeto = leitor.ler();
        const deslocamento = leitor.ler();
        if (typeof objeto !== 'number' || typeof deslocamento !== 'number') break;
        if (!this.diretos.has(objeto)) indice.set(objeto, { fluxo: num, pos: primeiro + deslocamento });
      }
    }
    return indice;
  }

  /** Bytes do fluxo já descompactados (null se usa um filtro de imagem ou desconhecido). */
  dadosDoFluxo(fluxo: Fluxo): Uint8Array | null {
    const filtro = this.resolver(fluxo.dic.v.get('Filter'));
    const parametros = this.resolver(fluxo.dic.v.get('DecodeParms'));
    const filtros = ehNome(filtro) ? [filtro] : ehLista(filtro) ? filtro.v.map((f) => this.resolver(f)) : [];
    let dados = fluxo.v;
    for (let i = 0; i < filtros.length; i++) {
      const f = filtros[i];
      if (!ehNome(f)) return null;
      const prm = ehLista(parametros) ? this.resolver(parametros.v[i]) : parametros;
      if (f.v === 'FlateDecode' || f.v === 'Fl') dados = desfazerPreditor(inflar(dados), ehDic(prm) ? prm : null);
      else if (f.v === 'ASCIIHexDecode' || f.v === 'AHx') dados = asciiHex(dados);
      else if (f.v === 'ASCII85Decode' || f.v === 'A85') dados = ascii85(dados);
      else if (f.v === 'Crypt') continue;
      else return null;
    }
    return dados;
  }

  /** Páginas em ordem, com os recursos (herdados do nó pai quando a página não tem). */
  paginas(): { pagina: Dic; recursos: Dic | null }[] {
    const lista: { pagina: Dic; recursos: Dic | null }[] = [];
    const vistos = new Set<Valor>();
    const raiz = this.resolver(this.trailer.v.get('Root'));
    const visitar = (no: Valor | null, herdados: Dic | null, profundidade: number) => {
      if (!ehDic(no) || vistos.has(no) || profundidade > 40 || lista.length > 2000) return;
      vistos.add(no);
      const recursos = this.resolver(no.v.get('Resources'));
      const meus = ehDic(recursos) ? recursos : herdados;
      const filhos = this.resolver(no.v.get('Kids'));
      if (ehLista(filhos)) {
        for (const filho of filhos.v) visitar(this.resolver(filho), meus, profundidade + 1);
      } else {
        lista.push({ pagina: no, recursos: meus });
      }
    };
    if (ehDic(raiz)) visitar(this.resolver(raiz.v.get('Pages')), null, 0);
    return lista;
  }

  conteudoDaPagina(pagina: Dic): Uint8Array {
    const conteudo = this.resolver(pagina.v.get('Contents'));
    const fluxos = ehFluxo(conteudo) ? [conteudo] : ehLista(conteudo) ? conteudo.v.map((c) => this.resolver(c)) : [];
    const partes: Uint8Array[] = [];
    for (const f of fluxos) {
      if (!ehFluxo(f)) continue;
      const dados = this.dadosDoFluxo(f);
      if (dados) partes.push(dados, Uint8Array.from([10]));
    }
    return juntar(...partes);
  }
}

// ---------------------------------------------------------------- texto das páginas

type Matriz = [number, number, number, number, number, number];
const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

function multiplicar(m1: Matriz, m2: Matriz): Matriz {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

const transladar = (x: number, y: number): Matriz => [1, 0, 0, 1, x, y];

type Pedaco = { x: number; y: number; xFim: number; texto: string; tamanho: number };

type EstadoGrafico = {
  ctm: Matriz;
  fonte: Fonte | null;
  tamanho: number;
  tc: number;
  tw: number;
  th: number;
  tl: number;
  subida: number;
};

function extrairPedacos(doc: DocumentoPdf, conteudo: Uint8Array, recursos: Dic | null, ctmInicial: Matriz, pedacos: Pedaco[], profundidade: number): void {
  const fontes = new Map<string, Fonte | null>();
  const fonteDe = (nome: string): Fonte | null => {
    if (fontes.has(nome)) return fontes.get(nome) ?? null;
    const dicFontes = recursos ? doc.resolver(recursos.v.get('Font')) : null;
    const dic = ehDic(dicFontes) ? doc.resolver(dicFontes.v.get(nome)) : null;
    const fonte = ehDic(dic) ? criarFonte(doc, dic) : null;
    fontes.set(nome, fonte);
    return fonte;
  };

  let g: EstadoGrafico = { ctm: ctmInicial, fonte: null, tamanho: 0, tc: 0, tw: 0, th: 1, tl: 0, subida: 0 };
  const pilhaGrafica: EstadoGrafico[] = [];
  let tm: Matriz = IDENTIDADE;
  let tlm: Matriz = IDENTIDADE;
  let operandos: Valor[] = [];
  const num = (i: number) => {
    const v = operandos[i];
    return typeof v === 'number' ? v : 0;
  };

  const proximaLinha = () => {
    tlm = multiplicar(transladar(0, -g.tl), tlm);
    tm = tlm;
  };

  /** Mostra texto: devolve o texto e anda com a matriz de texto. */
  const mostrar = (bytes: Uint8Array): string => {
    if (!g.fonte) return '';
    let texto = '';
    for (const glifo of g.fonte.glifos(bytes)) {
      texto += glifo.unicode;
      const espaco = glifo.espaco ? g.tw : 0;
      const avanco = ((glifo.largura / 1000) * g.tamanho + g.tc + espaco) * g.th;
      tm = multiplicar(transladar(avanco, 0), tm);
    }
    return texto;
  };

  const registrar = (inicio: Matriz, texto: string) => {
    if (texto.trim() === '') return;
    const m0 = multiplicar(multiplicar(transladar(0, g.subida), inicio), g.ctm);
    const m1 = multiplicar(multiplicar(transladar(0, g.subida), tm), g.ctm);
    const tamanho = Math.abs(g.tamanho * Math.hypot(m0[2], m0[3])) || Math.abs(g.tamanho) || 10;
    pedacos.push({ x: m0[4], y: m0[5], xFim: m1[4], texto, tamanho });
  };

  const leitor = new Leitor(conteudo, 0);
  for (let passos = 0; passos < 2_000_000; passos++) {
    const token = leitor.ler();
    if (token === undefined) break;
    if (!ehOperador(token)) {
      operandos.push(token);
      continue;
    }
    switch (token.v) {
      case 'q':
        pilhaGrafica.push({ ...g });
        break;
      case 'Q':
        g = pilhaGrafica.pop() ?? g;
        break;
      case 'cm':
        g = { ...g, ctm: multiplicar([num(0), num(1), num(2), num(3), num(4), num(5)], g.ctm) };
        break;
      case 'BT':
        tm = IDENTIDADE;
        tlm = IDENTIDADE;
        break;
      case 'Tf': {
        const nome = operandos[0];
        g = { ...g, fonte: ehNome(nome) ? fonteDe(nome.v) : null, tamanho: num(1) };
        break;
      }
      case 'Tc':
        g = { ...g, tc: num(0) };
        break;
      case 'Tw':
        g = { ...g, tw: num(0) };
        break;
      case 'Tz':
        g = { ...g, th: num(0) / 100 };
        break;
      case 'TL':
        g = { ...g, tl: num(0) };
        break;
      case 'Ts':
        g = { ...g, subida: num(0) };
        break;
      case 'Td':
        tlm = multiplicar(transladar(num(0), num(1)), tlm);
        tm = tlm;
        break;
      case 'TD':
        g = { ...g, tl: -num(1) };
        tlm = multiplicar(transladar(num(0), num(1)), tlm);
        tm = tlm;
        break;
      case 'Tm':
        tlm = [num(0), num(1), num(2), num(3), num(4), num(5)];
        tm = tlm;
        break;
      case 'T*':
        proximaLinha();
        break;
      case 'Tj':
      case "'":
      case '"': {
        if (token.v === '"') g = { ...g, tw: num(0), tc: num(1) };
        if (token.v !== 'Tj') proximaLinha();
        const bytes = operandos[operandos.length - 1];
        const inicio = tm;
        if (ehBytes(bytes)) registrar(inicio, mostrar(bytes.v));
        break;
      }
      case 'TJ': {
        const lista = operandos[0];
        if (!ehLista(lista)) break;
        const inicio = tm;
        let texto = '';
        for (const item of lista.v) {
          if (ehBytes(item)) texto += mostrar(item.v);
          else if (typeof item === 'number') {
            tm = multiplicar(transladar(((-item / 1000) * g.tamanho) * g.th, 0), tm);
            // recuo grande entre letras é um espaço que o gerador não escreveu
            if (-item > 180 && !texto.endsWith(' ')) texto += ' ';
          }
        }
        registrar(inicio, texto);
        break;
      }
      case 'Do': {
        const nome = operandos[0];
        if (!ehNome(nome) || !recursos || profundidade > 6) break;
        const xobjetos = doc.resolver(recursos.v.get('XObject'));
        const xobjeto = ehDic(xobjetos) ? doc.resolver(xobjetos.v.get(nome.v)) : null;
        if (!ehFluxo(xobjeto)) break;
        const subtipo = xobjeto.dic.v.get('Subtype');
        if (!ehNome(subtipo) || subtipo.v !== 'Form') break;
        const dados = doc.dadosDoFluxo(xobjeto);
        if (!dados) break;
        const matriz = doc.resolver(xobjeto.dic.v.get('Matrix'));
        const m: Matriz =
          ehLista(matriz) && matriz.v.length === 6 && matriz.v.every((v) => typeof v === 'number')
            ? (matriz.v as number[]).slice(0, 6) as Matriz
            : IDENTIDADE;
        const recursosDoForm = doc.resolver(xobjeto.dic.v.get('Resources'));
        extrairPedacos(doc, dados, ehDic(recursosDoForm) ? recursosDoForm : recursos, multiplicar(m, g.ctm), pedacos, profundidade + 1);
        break;
      }
      case 'BI':
        leitor.pularImagemEmbutida();
        break;
      default:
        break;
    }
    operandos = [];
  }
}

export type PedacoDaLinha = { x: number; xFim: number; texto: string };
export type LinhaDoPdf = { y: number; texto: string; pedacos: PedacoDaLinha[] };

/** Junta os pedaços em linhas (de cima para baixo), com espaço onde há distância entre eles. */
export function montarLinhas(pedacos: Pedaco[]): LinhaDoPdf[] {
  const ordenados = [...pedacos].sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: Pedaco[][] = [];
  for (const p of ordenados) {
    const atual = grupos[grupos.length - 1];
    const tolerancia = Math.max(1.5, Math.min(p.tamanho, atual?.[0]?.tamanho ?? p.tamanho) * 0.4);
    if (atual && Math.abs(atual[0].y - p.y) <= tolerancia) atual.push(p);
    else grupos.push([p]);
  }
  return grupos.map((grupo) => {
    const linha = [...grupo].sort((a, b) => a.x - b.x);
    let texto = '';
    let fimAnterior: number | null = null;
    for (const p of linha) {
      if (fimAnterior !== null) {
        const distancia = p.x - fimAnterior;
        if ((distancia > p.tamanho * 0.15 || distancia < -p.tamanho) && !texto.endsWith(' ') && !p.texto.startsWith(' ')) texto += ' ';
      }
      texto += p.texto;
      fimAnterior = Math.max(p.xFim, fimAnterior ?? p.xFim);
    }
    return {
      y: linha[0].y,
      texto: texto.replace(/\s+/g, ' ').trim(),
      pedacos: linha.map((p) => ({ x: p.x, xFim: p.xFim, texto: p.texto.replace(/\s+/g, ' ').trim() })),
    };
  });
}

export type ResultadoPdf =
  | { ok: true; paginas: LinhaDoPdf[][] }
  | { ok: false; motivo: 'precisa_senha' | 'senha_errada' | 'protecao_nao_suportada' | 'invalido' };

export function ehPdf(bytes: Uint8Array): boolean {
  return latin1(bytes, 0, Math.min(bytes.length, 1024)).includes('%PDF-');
}

/** Texto do PDF, página por página, em linhas. */
export function lerTextoDoPdf(bytes: Uint8Array, senha = ''): ResultadoPdf {
  if (!ehPdf(bytes)) return { ok: false, motivo: 'invalido' };
  let doc: DocumentoPdf;
  try {
    doc = new DocumentoPdf(bytes);
  } catch {
    return { ok: false, motivo: 'invalido' };
  }
  const aberto = doc.abrir(senha);
  if (aberto === 'nao_suportado') return { ok: false, motivo: 'protecao_nao_suportada' };
  if (aberto === 'senha') return { ok: false, motivo: senha === '' ? 'precisa_senha' : 'senha_errada' };
  try {
    const paginas = doc.paginas().map(({ pagina, recursos }) => {
      const pedacos: Pedaco[] = [];
      extrairPedacos(doc, doc.conteudoDaPagina(pagina), recursos, IDENTIDADE, pedacos, 0);
      return montarLinhas(pedacos);
    });
    return { ok: true, paginas };
  } catch {
    return { ok: false, motivo: 'invalido' };
  }
}
