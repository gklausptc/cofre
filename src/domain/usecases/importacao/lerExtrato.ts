import { textoParaCentavos } from '@/core/utils/currency';
import { pareceArquivoBinario, parseDataExtrato, removerBOM } from '@/core/utils/importParsers';
import { bancoPorCodigo, bancoPorTexto, origemPorNomeDoArquivo } from './bancos';
import { idExternoDeLinhas } from './deduplicar';
import { semAcentos } from './normalizarDescricao';
import { reconhecerLayout } from './layouts';
import type { BancoId, ExtratoLido, MarcaParcela, OrigemExtrato, TransacaoLida } from './tipos';

/**
 * Leitura de extratos e faturas em OFX, CSV e no TXT da fatura Ourocard (BB). Regras que
 * valem para todos os bancos (pesquisa de out/2026):
 * - o id de cada linha NÃO usa o FITID do OFX, que repete (BB, parcelas do Nubank) ou muda a
 *   cada download (Itaú, Bradesco, C6): usa data + valor + descrição normalizada + ordem entre
 *   linhas iguais, igual em CSV e OFX. A exceção é o identificador único do Nubank (UUID),
 *   que é o mesmo no CSV e no OFX da conta;
 * - linhas de saldo e totais aparecem no meio dos lançamentos e são descartadas;
 * - o sinal muda de arquivo para arquivo: aqui conta tem saída negativa e cartão tem compra
 *   positiva, sempre.
 */

// ---------------------------------------------------------------- CSV

export type TabelaCsv = {
  cabecalho: string[];
  linhas: string[][];
  /** Número (1 = primeira) da linha do cabeçalho no arquivo; 0 se o arquivo não tem cabeçalho. */
  linhaDoCabecalho: number;
  /** Linhas de título antes do cabeçalho (agência, período, data da fatura…). */
  preambulo: string[];
};

/** Papel de cada coluna, pelo índice no cabeçalho. Precisa de valor OU débito/crédito. */
export type MapeamentoColunas = {
  data: number;
  descricao: number[];
  valor?: number;
  debito?: number;
  credito?: number;
  /** Coluna "C/D", "Tipo", "Natureza" que diz se é entrada ou saída. */
  tipo?: number;
  parcela?: number;
  /** Coluna com identificador único da transação (o Nubank tem). */
  identificador?: number;
  /** Categoria que o próprio banco deu (fatura do C6, fatura antiga do Nubank). */
  categoria?: number;
};

function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const caractere = linha[i];
    if (caractere === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (caractere === separador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += caractere;
    }
  }
  campos.push(atual.trim());
  return campos;
}

/** Separador mais provável: o que aparece mais vezes, igual, nas primeiras linhas com conteúdo. */
function detectarSeparador(linhas: string[]): string {
  const candidatos = [';', ',', '\t'];
  const amostra = linhas.slice(0, 20);
  let melhor = ';';
  let melhorNota = -1;
  for (const separador of candidatos) {
    // quantas linhas têm a mesma quantidade de colunas (a mais comum), vezes essa quantidade
    const frequencia = new Map<number, number>();
    for (const linha of amostra) {
      const colunas = dividirLinha(linha, separador).length;
      if (colunas > 1) frequencia.set(colunas, (frequencia.get(colunas) ?? 0) + 1);
    }
    let nota = 0;
    for (const [colunas, vezes] of frequencia) nota = Math.max(nota, colunas * vezes);
    if (nota > melhorNota) {
      melhor = separador;
      melhorNota = nota;
    }
  }
  return melhor;
}

/** Cabeçalho comparável: minúsculas, sem acentos, sem pontuação. */
export function normalizarCabecalho(texto: string): string {
  return semAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9$/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAPEIS: { papel: keyof MapeamentoColunas; padrao: RegExp }[] = [
  { papel: 'data', padrao: /^(data|date|dt)\b|^data (de |do )?(lancamento|compra|movimento|transacao|operacao)/ },
  { papel: 'credito', padrao: /^(credito|entrada|entradas)\b/ },
  { papel: 'debito', padrao: /^(debito|saida|saidas)\b/ },
  { papel: 'valor', padrao: /^(valor|amount|quantia|montante)\b|valor .*r\$|valor em r|^r\$$/ },
  { papel: 'tipo', padrao: /^(tipo|natureza|d\/c|c\/d|dc|cd|tipo lancamento|tipo de lancamento|tipo da transacao)$/ },
  { papel: 'parcela', padrao: /^(parcela|parcelas|parc|parcelamento)\b/ },
  { papel: 'identificador', padrao: /^(identificador|id|id da transacao|codigo|fitid)$/ },
  { papel: 'categoria', padrao: /^(categoria|category)$/ },
  {
    papel: 'descricao',
    padrao:
      /^(descricao|historico|lancamento|lancamentos|titulo|title|estabelecimento|detalhes|memo|description|nome|favorecido|movimentacao|descricao da transacao|transacao|origem|destino)\b/,
  },
];

/** Colunas que nunca são o valor da transação, mesmo com "valor" no nome. */
const NAO_E_VALOR = /saldo|dolar|us\$|em us|cotacao|limite/;
/** Colunas com "nome" ou "descrição" no nome que não descrevem a transação. */
const NAO_E_DESCRICAO = /cartao|portador|titular|categoria|agencia|conta|documento|docto/;

/** Tenta descobrir o papel de cada coluna pelo nome. null se faltar data, descrição ou valor. */
export function mapearColunasPeloCabecalho(cabecalho: string[]): MapeamentoColunas | null {
  const normalizados = cabecalho.map(normalizarCabecalho);
  const achados: Partial<Record<keyof MapeamentoColunas, number>> = {};
  const descricoes: number[] = [];

  normalizados.forEach((nome, indice) => {
    if (nome === '') return;
    for (const { papel, padrao } of PAPEIS) {
      if (!padrao.test(nome)) continue;
      if ((papel === 'valor' || papel === 'debito' || papel === 'credito') && NAO_E_VALOR.test(nome)) return;
      if (papel === 'descricao' && NAO_E_DESCRICAO.test(nome)) return;
      if (papel === 'descricao') {
        descricoes.push(indice);
      } else if (achados[papel] === undefined) {
        achados[papel] = indice;
      }
      return;
    }
  });

  const temValor = achados.valor !== undefined || achados.debito !== undefined || achados.credito !== undefined;
  if (achados.data === undefined || descricoes.length === 0 || !temValor) return null;
  return {
    data: achados.data,
    descricao: descricoes,
    valor: achados.valor,
    debito: achados.debito,
    credito: achados.credito,
    tipo: achados.tipo,
    parcela: achados.parcela,
    identificador: achados.identificador,
    categoria: achados.categoria,
  };
}

/** Linha "data; texto; valor" sem cabeçalho (TXT do Itaú). */
function pareceLinhaDeLancamento(campos: string[]): boolean {
  return (
    campos.length >= 3 &&
    parseDataExtrato(campos[0]) !== null &&
    Number.isFinite(textoParaCentavos(campos[campos.length - 1])) &&
    /[A-Za-z]/.test(campos.slice(1, -1).join(' '))
  );
}

/** Separa o CSV e acha a linha de cabeçalho (bancos costumam pôr linhas de título antes dela). */
export function lerTabelaCsv(texto: string): TabelaCsv | null {
  const todas = texto.split(/\r\n|\n|\r/);
  const comConteudo = todas.map((linha, i) => ({ linha, numero: i + 1 })).filter((l) => l.linha.trim() !== '');
  if (comConteudo.length < 1) return null;

  const separador = detectarSeparador(comConteudo.map((l) => l.linha));
  const divididas = comConteudo.map((l) => ({ campos: dividirLinha(l.linha, separador), numero: l.numero, bruta: l.linha }));
  const linhasDeDados = (desde: number) =>
    divididas
      .slice(desde)
      .filter((l) => l.campos.some((c) => c !== ''))
      .map((l) => l.campos);

  const indiceCabecalho = divididas.slice(0, 30).findIndex((l) => mapearColunasPeloCabecalho(l.campos) !== null);
  if (indiceCabecalho >= 0) {
    return {
      cabecalho: divididas[indiceCabecalho].campos,
      linhaDoCabecalho: divididas[indiceCabecalho].numero,
      preambulo: divididas.slice(0, indiceCabecalho).map((l) => l.bruta),
      linhas: linhasDeDados(indiceCabecalho + 1),
    };
  }

  // sem cabeçalho reconhecível, mas as linhas já são lançamentos (data; histórico; valor)
  const amostra = divididas.slice(0, 10);
  if (amostra.length > 0 && amostra.filter((l) => pareceLinhaDeLancamento(l.campos)).length >= Math.ceil(amostra.length * 0.6)) {
    const colunas = Math.max(...amostra.map((l) => l.campos.length));
    const cabecalho = ['Data', ...Array.from({ length: colunas - 2 }, (_, i) => (i === 0 ? 'Histórico' : `Coluna ${i + 2}`)), 'Valor'];
    return { cabecalho, linhaDoCabecalho: 0, preambulo: [], linhas: linhasDeDados(0) };
  }

  const inicio = divididas.findIndex((l) => l.campos.length > 1);
  if (inicio < 0) return null;
  return {
    cabecalho: divididas[inicio].campos,
    linhaDoCabecalho: divididas[inicio].numero,
    preambulo: divididas.slice(0, inicio).map((l) => l.bruta),
    linhas: linhasDeDados(inicio + 1),
  };
}

const LINHA_DE_SALDO =
  /^(SALDO|S A L D O|TOTAL|SUBTOTAL|SUB TOTAL|LANCAMENTOS FUTUROS|SALDO ANTERIOR|SALDO DO DIA|SALDO FINAL|COD\.? LANC\.? 0)\b/;

function lerParcelaDaColuna(texto: string): MarcaParcela | null {
  const achado = texto.match(/(\d{1,2})\s*(\/|de)\s*(\d{1,2})/i);
  if (!achado) return null;
  const numero = Number(achado[1]);
  const total = Number(achado[3]);
  return numero >= 1 && total >= 2 && numero <= total ? { numero, total } : null;
}

/** "D", "Débito", "Saída" → saída; "C", "Crédito", "Entrada" → entrada. */
function sentidoDoTipo(texto: string): -1 | 1 | null {
  const t = semAcentos(texto);
  if (/^(D|DEBITO|SAIDA|DEB)\b/.test(t)) return -1;
  if (/^(C|CREDITO|ENTRADA|CRED)\b/.test(t)) return 1;
  return null;
}

/** "1.234,56 D" / "-50,00" / "50,00-" / "−R$ 7,50": valor em centavos com o sinal que o texto indica. */
function lerValorComSinal(texto: string): number {
  const limpo = texto.trim();
  const centavos = textoParaCentavos(limpo);
  if (!Number.isFinite(centavos)) return Number.NaN;
  const sufixo = semAcentos(limpo).match(/\b([DC])$/);
  if (sufixo) return sufixo[1] === 'D' ? -Math.abs(centavos) : Math.abs(centavos);
  if (/-\s*$/.test(limpo)) return -Math.abs(centavos);
  return centavos;
}

/** Primeira data completa (dd/mm/aaaa) do preâmbulo: referência para datas sem ano. */
function dataDeReferencia(preambulo: string[]): { ano: number; mes: number } | null {
  for (const linha of preambulo) {
    const achado = linha.match(/(\d{2})[/.](\d{2})[/.](\d{4})/);
    if (achado) return { ano: Number(achado[3]), mes: Number(achado[2]) };
  }
  return null;
}

/** Data com ano, ou "dd/mm" completada com o ano da referência (mês depois dela = ano anterior). */
function lerData(texto: string, referencia: { ano: number; mes: number } | null): string | null {
  const completa = parseDataExtrato(texto);
  if (completa || !referencia) return completa;
  const curta = texto.trim().match(/^(\d{1,2})[/.](\d{1,2})$/);
  if (!curta) return null;
  const mes = Number(curta[2]);
  const ano = mes > referencia.mes ? referencia.ano - 1 : referencia.ano;
  return parseDataExtrato(`${curta[1]}/${curta[2]}/${ano}`);
}

export type OpcoesLeituraCsv = {
  /** Compra vem negativa no arquivo (o app usa compra positiva). */
  inverterSinal?: boolean;
  /**
   * O arquivo repete o cabeçalho e, depois dele, lançamentos que já apareceram (bloco
   * "Últimos Lançamentos" do Bradesco): essas repetições são descartadas.
   */
  blocoRepetido?: boolean;
  /** Vencimento da fatura, quando o arquivo diz (nome do arquivo, cabeçalho). */
  vencimentoFatura?: string | null;
};

/**
 * Linhas do CSV → transações, com o mapeamento de colunas dado (detectado ou escolhido pelo
 * usuário).
 */
export function lerCsvComMapeamento(
  tabela: TabelaCsv,
  mapeamento: MapeamentoColunas,
  banco: BancoId | null,
  origem: OrigemExtrato | null,
  opcoes: OpcoesLeituraCsv = {}
): ExtratoLido {
  const lidas: Omit<TransacaoLida, 'idExterno'>[] = [];
  const identificadores: (string | null)[] = [];
  const referencia = dataDeReferencia(tabela.preambulo);
  const cabecalhoNormalizado = tabela.cabecalho.map(normalizarCabecalho).join('|');
  const jaVistas = new Set<string>();
  let depoisDeRepeticao = false;
  let ignoradas = 0;

  tabela.linhas.forEach((campos, i) => {
    const pegar = (indice: number | undefined) => (indice === undefined ? '' : (campos[indice] ?? '').trim());

    if (campos.map(normalizarCabecalho).join('|') === cabecalhoNormalizado) {
      depoisDeRepeticao = true;
      ignoradas++;
      return;
    }
    const assinatura = campos.join('\u0001');
    if (opcoes.blocoRepetido && depoisDeRepeticao && jaVistas.has(assinatura)) {
      ignoradas++;
      return;
    }
    jaVistas.add(assinatura);

    const descricao = mapeamento.descricao
      .map(pegar)
      .filter((parte, posicao, todas) => parte !== '' && todas.indexOf(parte) === posicao)
      .join(' - ');
    const data = lerData(pegar(mapeamento.data), referencia);

    let valor = Number.NaN;
    if (mapeamento.valor !== undefined && pegar(mapeamento.valor) !== '') {
      valor = lerValorComSinal(pegar(mapeamento.valor));
    } else {
      const credito = pegar(mapeamento.credito) !== '' ? Math.abs(lerValorComSinal(pegar(mapeamento.credito))) : 0;
      const debito = pegar(mapeamento.debito) !== '' ? Math.abs(lerValorComSinal(pegar(mapeamento.debito))) : 0;
      if (pegar(mapeamento.credito) !== '' || pegar(mapeamento.debito) !== '') valor = credito - debito;
    }
    if (mapeamento.tipo !== undefined && Number.isFinite(valor)) {
      const sentido = sentidoDoTipo(pegar(mapeamento.tipo));
      if (sentido !== null) valor = sentido * Math.abs(valor);
    }
    if (opcoes.inverterSinal && Number.isFinite(valor)) valor = -valor;

    if (!data || !Number.isFinite(valor) || valor === 0 || LINHA_DE_SALDO.test(semAcentos(descricao))) {
      ignoradas++;
      return;
    }
    lidas.push({
      data,
      descricao: descricao || 'Importado do extrato',
      valor,
      parcela: mapeamento.parcela !== undefined ? lerParcelaDaColuna(pegar(mapeamento.parcela)) : null,
      linha: tabela.linhaDoCabecalho + i + 1,
      ...(mapeamento.categoria !== undefined && pegar(mapeamento.categoria) !== ''
        ? { categoriaDoBanco: pegar(mapeamento.categoria) }
        : {}),
    });
    identificadores.push(
      mapeamento.identificador !== undefined && pegar(mapeamento.identificador) !== '' ? pegar(mapeamento.identificador) : null
    );
  });

  const porHash = idExternoDeLinhas(lidas, `h:${banco ?? 'outro'}`);
  const transacoes = lidas.map((t, i) => ({
    ...t,
    idExterno: identificadores[i] ? `id:${banco ?? 'outro'}:${identificadores[i]}` : porHash[i],
  }));
  return montarExtrato('csv', banco, origem, transacoes, ignoradas, opcoes.vencimentoFatura ?? null);
}

// ---------------------------------------------------------------- OFX

function campoOfx(bloco: string, nome: string): string | null {
  const achado = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
  const valor = achado?.[1]?.trim();
  return valor ? valor : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lerOfx(texto: string, nomeArquivo: string): ExtratoLido {
  const ehCartao = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(texto);
  const codigo = campoOfx(texto, 'BANKID');
  const org = campoOfx(texto, 'ORG') ?? '';
  const banco = (codigo ? bancoPorCodigo(codigo) : null) ?? bancoPorTexto(org) ?? bancoPorTexto(nomeArquivo);

  const blocos = texto.match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) ?? [];
  const lidas: Omit<TransacaoLida, 'idExterno'>[] = [];
  const fitids: (string | null)[] = [];
  let ignoradas = 0;

  blocos.forEach((bloco, i) => {
    const dataOfx = campoOfx(bloco, 'DTPOSTED') ?? '';
    const data = /^\d{8}/.test(dataOfx) ? parseDataExtrato(`${dataOfx.slice(0, 4)}-${dataOfx.slice(4, 6)}-${dataOfx.slice(6, 8)}`) : null;
    const valorTexto = campoOfx(bloco, 'TRNAMT');
    const valorOfx = valorTexto ? textoParaCentavos(valorTexto) : Number.NaN;
    // saldo do dia vem como lançamento de valor zero (e às vezes data inválida, no BB)
    if (!data || !Number.isFinite(valorOfx) || valorOfx === 0) {
      ignoradas++;
      return;
    }
    const memo = campoOfx(bloco, 'MEMO');
    const nome = campoOfx(bloco, 'NAME');
    // BB: NAME é o lançamento ("Pix - Enviado") e MEMO os detalhes; os dois juntos ajudam
    const descricao =
      memo && nome && !memo.toUpperCase().includes(nome.toUpperCase()) && !nome.toUpperCase().includes(memo.toUpperCase())
        ? `${nome} - ${memo}`
        : (memo ?? nome ?? 'Importado do extrato');
    if (LINHA_DE_SALDO.test(semAcentos(descricao))) {
      ignoradas++;
      return;
    }

    lidas.push({
      data,
      descricao: descricao.trim(),
      // na fatura em OFX a compra vem negativa (débito no cartão); aqui compra é positiva
      valor: ehCartao ? -valorOfx : valorOfx,
      parcela: null,
      linha: i + 1,
    });
    fitids.push(campoOfx(bloco, 'FITID'));
  });

  const porHash = idExternoDeLinhas(lidas, `h:${banco ?? 'outro'}`);
  const transacoes = lidas.map((t, i) => {
    const fitid = fitids[i];
    // só o UUID da conta Nubank é confiável (e igual ao "Identificador" do CSV); no cartão ele repete entre parcelas
    const usaFitid = !ehCartao && fitid !== null && UUID.test(fitid);
    return { ...t, idExterno: usaFitid ? `id:${banco ?? 'outro'}:${fitid}` : porHash[i] };
  });
  return montarExtrato('ofx', banco, ehCartao ? 'cartao' : 'conta', transacoes, ignoradas, null);
}

// ---------------------------------------------------------------- TXT da fatura Ourocard (BB)

const LINHA_OUROCARD = /^(\d{2})\.(\d{2})\.(\d{4})(.*?)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;

function ehFaturaOurocard(texto: string): boolean {
  return /Vencimento\s*:\s*\d{2}\.\d{2}\.\d{4}/i.test(texto) && /^\d{2}\.\d{2}\.\d{4}\S/m.test(texto);
}

/** TXT de largura fixa: "15.10.2026PADARIA EXEMPLO   SAO PAULO   BR   25,90   0,00". */
function lerFaturaOurocard(texto: string): ExtratoLido {
  const vencimento = texto.match(/Vencimento\s*:\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  const lidas: Omit<TransacaoLida, 'idExterno'>[] = [];
  let ignoradas = 0;

  texto.split(/\r\n|\n|\r/).forEach((linha, i) => {
    const achado = linha.match(LINHA_OUROCARD);
    if (!achado) return;
    const [, dia, mes, ano, resto, valorReais] = achado;
    // tira o país no fim ("   BR") e junta os espaços da largura fixa
    const descricao = resto.replace(/\s{2,}[A-Z]{2}\s*$/, '').replace(/\s+/g, ' ').trim();
    const data = parseDataExtrato(`${dia}/${mes}/${ano}`);
    const valor = textoParaCentavos(valorReais);
    if (!data || !Number.isFinite(valor) || valor === 0 || LINHA_DE_SALDO.test(semAcentos(descricao))) {
      ignoradas++;
      return;
    }
    lidas.push({ data, descricao, valor, parcela: null, linha: i + 1 });
  });

  const porHash = idExternoDeLinhas(lidas, 'h:bb');
  return montarExtrato(
    'txt',
    'bb',
    'cartao',
    lidas.map((t, i) => ({ ...t, idExterno: porHash[i] })),
    ignoradas,
    vencimento ? `${vencimento[3]}-${vencimento[2]}-${vencimento[1]}` : null
  );
}

// ---------------------------------------------------------------- geral

function montarExtrato(
  formato: ExtratoLido['formato'],
  banco: BancoId | null,
  origem: OrigemExtrato | null,
  transacoes: TransacaoLida[],
  ignoradas: number,
  vencimentoFatura: string | null
): ExtratoLido {
  const datas = transacoes.map((t) => t.data).sort();
  return {
    formato,
    banco,
    origem,
    transacoes,
    ignoradas,
    periodo: datas.length > 0 ? { inicio: datas[0], fim: datas[datas.length - 1] } : null,
    vencimentoFatura: origem === 'cartao' ? vencimentoFatura : null,
  };
}

/** "Fatura_2026-11-10.csv" (C6), "Nubank_2026-11-05.csv": a data do nome é o vencimento. */
function vencimentoPeloNomeDoArquivo(nome: string): string | null {
  const achado = nome.match(/(\d{4})-(\d{2})-(\d{2})/);
  return achado ? parseDataExtrato(achado[0]) : null;
}

export type ResultadoLeitura =
  | { ok: true; extrato: ExtratoLido }
  /** CSV que o app não reconheceu: o usuário diz qual coluna é qual. */
  | { ok: false; motivo: 'precisa_mapear'; tabela: TabelaCsv; banco: BancoId | null; origem: OrigemExtrato | null }
  | { ok: false; motivo: 'nao_suportado' | 'sem_transacoes'; mensagem: string };

const MENSAGEM_NAO_SUPORTADO =
  'Esse arquivo não é CSV, OFX nem TXT de extrato. PDF e Excel não são suportados: exporte em CSV ou OFX no app do banco.';

/**
 * Primeira etapa da importação: lê um extrato de conta ou fatura de cartão (OFX, CSV ou o TXT
 * da fatura Ourocard) de qualquer um dos bancos conhecidos e devolve as transações no formato
 * único do app. Quando o CSV é de um formato desconhecido, devolve a tabela para o usuário
 * mapear as colunas.
 */
export function lerExtrato(conteudo: string, nomeArquivo: string): ResultadoLeitura {
  const texto = removerBOM(conteudo);
  if (/\.(pdf|xlsx?|zip)$/i.test(nomeArquivo) || pareceArquivoBinario(texto) || texto.startsWith('PK')) {
    return { ok: false, motivo: 'nao_suportado', mensagem: MENSAGEM_NAO_SUPORTADO };
  }

  if (/\.ofx$/i.test(nomeArquivo) || /<OFX>/i.test(texto)) {
    const extrato = lerOfx(texto, nomeArquivo);
    return extrato.transacoes.length > 0
      ? { ok: true, extrato }
      : { ok: false, motivo: 'sem_transacoes', mensagem: 'Não encontrei transações nesse arquivo OFX.' };
  }

  if (ehFaturaOurocard(texto)) {
    const extrato = lerFaturaOurocard(texto);
    return extrato.transacoes.length > 0
      ? { ok: true, extrato }
      : { ok: false, motivo: 'sem_transacoes', mensagem: 'Não encontrei compras nessa fatura.' };
  }

  const tabela = lerTabelaCsv(texto);
  if (!tabela || tabela.linhas.length === 0) {
    return { ok: false, motivo: 'nao_suportado', mensagem: MENSAGEM_NAO_SUPORTADO };
  }

  const cabecalhoNormalizado = tabela.cabecalho.map(normalizarCabecalho);
  const layout = reconhecerLayout(cabecalhoNormalizado);
  const banco = layout?.banco ?? bancoPorTexto(nomeArquivo);
  const origem = layout?.origem ?? origemPorNomeDoArquivo(nomeArquivo);
  const mapeamento = layout?.mapear(cabecalhoNormalizado) ?? mapearColunasPeloCabecalho(tabela.cabecalho);
  if (!mapeamento) return { ok: false, motivo: 'precisa_mapear', tabela, banco, origem };

  const extrato = lerCsvComMapeamento(tabela, mapeamento, banco, origem, {
    inverterSinal: layout?.inverterSinal,
    blocoRepetido: layout?.blocoRepetido,
    vencimentoFatura: vencimentoPeloNomeDoArquivo(nomeArquivo),
  });
  return extrato.transacoes.length > 0
    ? { ok: true, extrato }
    : { ok: false, motivo: 'precisa_mapear', tabela, banco, origem };
}
