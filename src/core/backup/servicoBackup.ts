import * as Sharing from 'expo-sharing';
import { repositorios } from '@/domain/repositories';
import {
  montarBackup,
  nomeArquivoBackup,
  prepararTabelasParaRestaurar,
  resumirBackup,
  validarBackup,
  type BackupCofre,
  type ItemResumoBackup,
} from '@/domain/usecases/backup';
import { abrirSeletorDeArquivos } from '@/core/arquivos/seletorDeArquivos';
import { lerJson, salvarBackupAutomatico, salvarParaCompartilhar } from './arquivosBackup';

const TIPOS_ACEITOS = ['application/json', 'text/json', 'text/plain', 'application/octet-stream'];

export type BackupLido = { ok: true; backup: BackupCofre; resumo: ItemResumoBackup[] } | { ok: false; erro: string };

async function gerarBackupAtual(agora: Date): Promise<BackupCofre> {
  const repo = repositorios().backup;
  const [tabelas, versao] = await Promise.all([repo.exportarTabelas(), repo.versaoSchemaAtual()]);
  return montarBackup(tabelas, versao, agora);
}

async function compartilharArquivoJson(uri: string, titulo: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('O compartilhamento não está disponível neste aparelho.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: titulo });
}

/** Gera o backup de tudo e abre o compartilhamento do sistema (Arquivos/iCloud, WhatsApp, e-mail). */
export async function compartilharBackup(): Promise<void> {
  const agora = new Date();
  const backup = await gerarBackupAtual(agora);
  const uri = salvarParaCompartilhar(nomeArquivoBackup(agora), backup);
  await compartilharArquivoJson(uri, 'Salvar backup do Cofre');
}

export async function compartilharBackupAutomatico(uri: string): Promise<void> {
  await compartilharArquivoJson(uri, 'Salvar cópia do Cofre');
}

/** O compartilhamento não informa se o arquivo foi salvo — quem confirma é o usuário. */
export async function registrarBackupFeito(): Promise<void> {
  await repositorios().backup.registrarUltimoBackup(new Date().toISOString());
}

export async function lerBackupDoArquivo(uri: string): Promise<BackupLido> {
  let conteudo: unknown;
  try {
    conteudo = await lerJson(uri);
  } catch {
    return { ok: false, erro: 'Não consegui ler esse arquivo.' };
  }
  const versaoAtual = await repositorios().backup.versaoSchemaAtual();
  const resultado = validarBackup(conteudo, versaoAtual);
  if (!resultado.ok) return resultado;
  return { ok: true, backup: resultado.backup, resumo: resumirBackup(resultado.backup) };
}

/** Abre o seletor de arquivos; null se o usuário cancelou. */
export async function escolherArquivoDeBackup(): Promise<BackupLido | null> {
  const escolha = await abrirSeletorDeArquivos(TIPOS_ACEITOS, false);
  if (escolha.canceled || escolha.assets.length === 0) return null;
  return lerBackupDoArquivo(escolha.assets[0].uri);
}

/**
 * Substitui todos os dados pelos do backup. Antes, guarda uma cópia automática do que
 * existe agora; a troca em si é uma transação única (se falhar, nada muda).
 */
export async function restaurarBackup(backup: BackupCofre): Promise<void> {
  const repo = repositorios().backup;
  const agora = new Date();
  salvarBackupAutomatico(await gerarBackupAtual(agora), 'antes-de-restaurar', agora);
  const preferenciasAtuais = await repo.lerPreferenciasGravadas();
  await repo.substituirTabelas(prepararTabelasParaRestaurar(backup, preferenciasAtuais));
}
