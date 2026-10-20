import { semAcentos } from './normalizarDescricao';
import type { BancoId, OrigemExtrato } from './tipos';

export const NOMES_DOS_BANCOS: Record<BancoId, string> = {
  bb: 'Banco do Brasil',
  santander: 'Santander',
  bradesco: 'Bradesco',
  itau: 'Itaú',
  nubank: 'Nubank',
  c6: 'C6 Bank',
  picpay: 'PicPay',
  infinitepay: 'InfinitePay',
};

/** Código do banco na compensação (COMPE), como vem no BANKID do OFX. */
const CODIGOS_COMPE: Record<string, BancoId> = {
  '1': 'bb',
  '33': 'santander',
  '237': 'bradesco',
  '341': 'itau',
  '260': 'nubank',
  '336': 'c6',
  '380': 'picpay',
  '542': 'infinitepay',
};

/** Como o banco aparece em nomes de arquivo, no ORG do OFX ou no cadastro de contas/cartões. */
const APELIDOS: [BancoId, RegExp][] = [
  ['bb', /\bBANCO DO BRASIL\b|\bBANCODOBRASIL\b|\bBB\b|^BB[ _-]|OUROCARD/],
  ['santander', /SANTANDER/],
  ['bradesco', /BRADESCO/],
  ['itau', /\bITAU\b|ITAU ?UNIBANCO|PERSONNALITE/],
  ['nubank', /\bNU ?BANK\b|\bNU PAGAMENTOS\b|^NU[ _-]/],
  ['c6', /\bC6\b|C6 ?BANK/],
  ['picpay', /PICPAY|PIC PAY/],
  ['infinitepay', /INFINITE ?PAY|INFINITY ?PAY|CLOUDWALK/],
];

export function bancoPorCodigo(codigo: string): BancoId | null {
  return CODIGOS_COMPE[String(Number(codigo))] ?? null;
}

/** Reconhece o banco num texto livre (nome do arquivo, ORG do OFX, nome da conta). */
export function bancoPorTexto(texto: string): BancoId | null {
  const limpo = semAcentos(texto.replace(/[_.-]/g, ' '));
  return APELIDOS.find(([, padrao]) => padrao.test(limpo))?.[0] ?? null;
}

/** "fatura-c6-2026-10.csv" → cartão; "extrato_conta.ofx" → conta. */
export function origemPorNomeDoArquivo(nome: string): OrigemExtrato | null {
  const limpo = semAcentos(nome.replace(/[_.-]/g, ' '));
  if (/FATURA|CARTAO|CREDITO|CREDIT|CARD/.test(limpo)) return 'cartao';
  if (/EXTRATO|CONTA|CORRENTE|STATEMENT/.test(limpo)) return 'conta';
  return null;
}
