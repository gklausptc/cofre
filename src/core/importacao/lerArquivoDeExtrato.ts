import { File } from 'expo-file-system';
import { decodificarLatin1, removerBOM, temCaracteresInvalidos } from '@/core/utils/importParsers';
import { ehPdf, lerTextoDoPdf } from '@/core/utils/pdf/lerPdf';
import { lerExtrato, type ResultadoLeitura } from '@/domain/usecases/importacao/lerExtrato';
import { lerExtratoDoPdf } from '@/domain/usecases/importacao/lerPdf';
import { ehPlanilhaDoCofre } from '@/domain/usecases/importacao/planilhaDoCofre';

/**
 * Leitura de um arquivo de extrato: o mesmo que `lerExtrato`, mais o PDF que pede senha e a
 * planilha do Cofre Klaus (que tem tela própria: importa tudo de uma vez, sem perguntas).
 */
export type ResultadoDoArquivo =
  | ResultadoLeitura
  | { ok: false; motivo: 'precisa_senha' | 'senha_errada'; mensagem: string }
  | { ok: false; motivo: 'planilha_do_cofre'; mensagem: string };

/** O texto de um arquivo (UTF-8; se vier com caracteres trocados, Latin-1). */
export async function lerTextoDoArquivo(uri: string): Promise<string> {
  const arquivo = new File(uri);
  let texto: string | null = null;
  try {
    texto = await arquivo.text();
  } catch {
    texto = null;
  }
  if (texto === null || temCaracteresInvalidos(texto)) texto = decodificarLatin1(await arquivo.bytes());
  return removerBOM(texto);
}

/** Texto curto do erro, para a mensagem dizer onde parou (ajuda a corrigir o leitor). */
export function detalheDoErro(erro: unknown): string {
  if (erro instanceof Error) return `${erro.name}: ${erro.message}`.slice(0, 160);
  return String(erro).slice(0, 160);
}

/** PDF → extrato, abrindo com a senha quando o arquivo tem. */
export function lerPdfDeExtrato(bytes: Uint8Array, nome: string, senha = ''): ResultadoDoArquivo {
  let pdf: ReturnType<typeof lerTextoDoPdf>;
  try {
    pdf = lerTextoDoPdf(bytes, senha);
  } catch (erro) {
    return { ok: false, motivo: 'nao_suportado', mensagem: `Não consegui ler esse PDF. Detalhe técnico: ${detalheDoErro(erro)}` };
  }
  if (!pdf.ok) {
    if (pdf.motivo === 'precisa_senha') {
      return { ok: false, motivo: 'precisa_senha', mensagem: 'Esse PDF tem senha. Digite a senha do arquivo (o banco costuma usar parte do seu CPF).' };
    }
    if (pdf.motivo === 'senha_errada') return { ok: false, motivo: 'senha_errada', mensagem: 'Senha errada. Confira e tente de novo.' };
    if (pdf.motivo === 'protecao_nao_suportada') {
      return {
        ok: false,
        motivo: 'nao_suportado',
        mensagem: 'Esse PDF usa uma proteção que o app ainda não abre. Exporte em CSV ou OFX, ou baixe o PDF sem senha.',
      };
    }
    return { ok: false, motivo: 'nao_suportado', mensagem: 'Não consegui ler esse PDF (a estrutura do arquivo não foi reconhecida).' };
  }
  let extrato: ReturnType<typeof lerExtratoDoPdf>;
  try {
    extrato = lerExtratoDoPdf(pdf.paginas, nome);
  } catch (erro) {
    return {
      ok: false,
      motivo: 'nao_suportado',
      mensagem: `Abri o PDF, mas não consegui montar os lançamentos. Detalhe técnico: ${detalheDoErro(erro)}`,
    };
  }
  if (!extrato) {
    const temTexto = pdf.paginas.some((p) => p.length > 0);
    return {
      ok: false,
      motivo: 'sem_transacoes',
      mensagem: temTexto
        ? 'Não encontrei lançamentos nesse PDF (a fatura pode estar zerada).'
        : 'Esse PDF é uma imagem (escaneado) e não tem texto para ler. Baixe o extrato pelo app do banco.',
    };
  }
  return { ok: true, extrato };
}

/**
 * Lê o arquivo escolhido: PDF pelos bytes; texto (CSV, OFX, TXT) em UTF-8 e, se vier com
 * caracteres trocados, em Latin-1 (comum nos bancos brasileiros).
 */
export async function lerArquivoDeExtrato(uri: string, nome: string, senha = ''): Promise<ResultadoDoArquivo> {
  const arquivo = new File(uri);
  let bytes: Uint8Array | null = null;
  if (/\.pdf$/i.test(nome)) {
    try {
      bytes = await arquivo.bytes();
    } catch (erro) {
      return { ok: false, motivo: 'nao_suportado', mensagem: `Não consegui abrir o arquivo no aparelho. Detalhe técnico: ${detalheDoErro(erro)}` };
    }
    if (ehPdf(bytes)) return lerPdfDeExtrato(bytes, nome, senha);
  }
  let texto: string | null = null;
  try {
    texto = await arquivo.text();
  } catch {
    texto = null;
  }
  if (texto === null || temCaracteresInvalidos(texto)) {
    bytes = bytes ?? (await arquivo.bytes());
    if (ehPdf(bytes)) return lerPdfDeExtrato(bytes, nome, senha);
    texto = decodificarLatin1(bytes);
  } else if (texto.startsWith('%PDF-')) {
    return lerPdfDeExtrato(bytes ?? (await arquivo.bytes()), nome, senha);
  }
  if (ehPlanilhaDoCofre(texto)) {
    return { ok: false, motivo: 'planilha_do_cofre', mensagem: 'É uma planilha do Cofre Klaus: importe sozinha, em Importar extrato.' };
  }
  return lerExtrato(removerBOM(texto), nome);
}

/** Tipos que o seletor de arquivos aceita (extratos em texto, OFX e PDF). */
export const TIPOS_DE_ARQUIVO_DE_EXTRATO = [
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/x-ofx',
  'application/vnd.ms-excel',
  'application/pdf',
  'application/octet-stream',
];
