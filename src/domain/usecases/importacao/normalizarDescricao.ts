import type { MarcaParcela } from './tipos';

export type DescricaoNormalizada = {
  /** Maiúsculas, sem acentos, sem prefixos de meio de pagamento, datas e códigos. */
  normalizada: string;
  /** Prefixo de intermediador que foi tirado (ex.: 'IFD' do iFood, 'MP' do Mercado Pago). */
  intermediador: string | null;
  /** Nome de quem recebeu ou enviou o PIX, quando a linha é um PIX. */
  pix: { sentido: 'enviado' | 'recebido' | null; nome: string } | null;
  /** "03/06", "PARC 3/6", "3 DE 6" encontrados no texto. */
  parcela: MarcaParcela | null;
};

/** Tira acentos e deixa em maiúsculas com espaços simples. */
export function semAcentos(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Intermediadores que aparecem antes do nome da loja ("IFD*PIZZARIA", "MP *LOJA"). */
const INTERMEDIADORES: { padrao: RegExp; nome: string }[] = [
  { padrao: /^IFD\s*\*\s*/, nome: 'IFD' },
  { padrao: /^IFOOD\s*\*\s*/, nome: 'IFD' },
  { padrao: /^MP\s*\*\s*/, nome: 'MP' },
  { padrao: /^MERCADOPAGO\s*\*\s*/, nome: 'MP' },
  { padrao: /^PAG\s*\*\s*/, nome: 'PAG' },
  { padrao: /^PAGSEGURO\s*\*\s*/, nome: 'PAG' },
  { padrao: /^PG\s*\*\s*/, nome: 'PG' },
  { padrao: /^PICPAY\s*\*\s*/, nome: 'PICPAY' },
  { padrao: /^EC\s*\*\s*/, nome: 'EC' },
  { padrao: /^DL\s*\*\s*/, nome: 'DL' },
  { padrao: /^PAYPAL\s*\*\s*/, nome: 'PAYPAL' },
  { padrao: /^STONE\s*\*\s*/, nome: 'STONE' },
  { padrao: /^SUMUP\s*\*\s*/, nome: 'SUMUP' },
  { padrao: /^IZ\s*\*\s*/, nome: 'IZ' },
];

/** Prefixos do tipo de operação, que não ajudam a reconhecer o comerciante. */
const PREFIXOS_OPERACAO = [
  /^PIX (ENVIADO|RECEBIDO|TRANSF(ERENCIA)?|EMITIDO|QR CODE)( (PARA|DE|-))?\s*/,
  /^TRANSF(ERENCIA)? (PIX )?(ENVIADA|RECEBIDA|EMITIDA)?( (PARA|DE|-))?\s*/,
  /^(COMPRA|PAGAMENTO) (NO |COM |C\/ )?(CARTAO|DEBITO|CREDITO)( (DE )?(DEBITO|CREDITO))?\s*(-\s*)?/,
  /^COMPRA ELO\s*/,
  /^COMPRA\s*-\s*/,
  /^DEBITO AUTOMATICO\s*/,
  /^PAGAMENTO DE BOLETO\s*/,
  /^PAGTO\.? (DE )?(BOLETO|TITULO)\s*/,
];

const SENTIDO_PIX: [RegExp, 'enviado' | 'recebido'][] = [
  [/\bPIX\b.*\b(ENVIADO|EMITIDO|ENVIADA|PARA)\b/, 'enviado'],
  [/\bPIX\b.*\b(RECEBIDO|RECEBIDA|DE)\b/, 'recebido'],
  [/\bTRANSF(ERENCIA)?\b.*\b(ENVIADA|EMITIDA|PARA)\b/, 'enviado'],
  [/\bTRANSF(ERENCIA)?\b.*\b(RECEBIDA|DE)\b/, 'recebido'],
];

const TAMANHO_MAXIMO_PARCELADO = 48;

/** "PARC 3/6", "PARCELA 03 DE 06", "3 DE 6" ou "03/06" no fim do texto. */
function encontrarParcela(texto: string): { parcela: MarcaParcela; trecho: string } | null {
  const padroes = [
    /\bPARC(ELA)?\.?\s*(\d{1,2})\s*(\/|DE)\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s+DE\s+(\d{1,2})\s*$/,
    /\b(\d{2})\s*\/\s*(\d{2})\s*$/,
  ];
  for (const padrao of padroes) {
    const achado = texto.match(padrao);
    if (!achado) continue;
    const numeros = achado.slice(1).filter((parte) => parte !== undefined && /^\d+$/.test(parte)).map(Number);
    const [numero, total] = numeros;
    if (numero >= 1 && total >= 2 && numero <= total && total <= TAMANHO_MAXIMO_PARCELADO) {
      return { parcela: { numero, total }, trecho: achado[0] };
    }
  }
  return null;
}

/**
 * Deixa a descrição do extrato comparável entre bancos e meses: maiúsculas, sem acentos,
 * sem prefixos de operação ("PIX ENVIADO", "COMPRA CARTAO") e de intermediador ("IFD*",
 * "MP*", "PAG*", "PG *"), sem datas, horas e códigos de autorização. Também separa o nome
 * do PIX e a marca de parcela, quando houver.
 */
export function normalizarDescricao(original: string): DescricaoNormalizada {
  let texto = semAcentos(original);

  const pixDetectado = /\bPIX\b|\bTRANSF/.test(texto);
  const sentido = SENTIDO_PIX.find(([padrao]) => padrao.test(texto))?.[1] ?? null;

  const achadoParcela = encontrarParcela(texto);
  if (achadoParcela) texto = texto.replace(achadoParcela.trecho, ' ');

  for (const prefixo of PREFIXOS_OPERACAO) texto = texto.replace(prefixo, '');

  let intermediador: string | null = null;
  for (const { padrao, nome } of INTERMEDIADORES) {
    if (padrao.test(texto)) {
      intermediador = nome;
      texto = texto.replace(padrao, '');
      break;
    }
  }

  texto = texto
    // datas e horas
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
    // CPF/CNPJ (inteiros ou mascarados) e códigos longos (autorização, NSU, documento)
    .replace(/[*X\d]{2,3}\.[*X\d]{3}\.[*X\d]{3}[-/][*X\d]{2,4}(-[*X\d]{2})?/g, ' ')
    .replace(/\b(AUT|NSU|DOC|ID|CV|REF)\.?\s*:?\s*\d+\b/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    // pontuação solta
    .replace(/[*#|;_]+/g, ' ')
    .replace(/\s+-\s+|\s+-$|^-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    normalizada: texto,
    intermediador,
    pix: pixDetectado && texto !== '' ? { sentido, nome: texto } : null,
    parcela: achadoParcela?.parcela ?? null,
  };
}
