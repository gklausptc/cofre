import { Directory, File, Paths } from 'expo-file-system';
import {
  backupsAutomaticosParaApagar,
  nomeBackupAutomatico,
  ordenarBackupsAutomaticos,
  type BackupCofre,
  type InfoBackupAutomatico,
  type MotivoBackupAutomatico,
} from '@/domain/usecases/backup';

/**
 * Arquivos de backup no aparelho. As cópias automáticas ficam em `documentDirectory/backups`,
 * que fica dentro do Expo Go: protegem contra uma atualização ou restauração que dê errado,
 * mas somem se o Expo Go for apagado. Por isso o backup "de verdade" é o compartilhado.
 */

function pastaBackups(): Directory {
  const pasta = new Directory(Paths.document, 'backups');
  if (!pasta.exists) pasta.create({ intermediates: true, idempotent: true });
  return pasta;
}

export function salvarBackupAutomatico(backup: BackupCofre, motivo: MotivoBackupAutomatico, agora: Date): void {
  const pasta = pastaBackups();
  const arquivo = new File(pasta, nomeBackupAutomatico(agora, motivo));
  arquivo.create({ overwrite: true, intermediates: true });
  arquivo.writeSync(JSON.stringify(backup));

  const nomes = pasta.list().filter((item) => item instanceof File).map((item) => item.name);
  for (const nome of backupsAutomaticosParaApagar(nomes)) {
    new File(pasta, nome).delete();
  }
}

export type BackupAutomaticoNoAparelho = InfoBackupAutomatico & { uri: string; tamanhoBytes: number };

export function listarBackupsAutomaticos(): BackupAutomaticoNoAparelho[] {
  const pasta = pastaBackups();
  const arquivos = pasta.list().filter((item): item is File => item instanceof File);
  const porNome = new Map(arquivos.map((arquivo) => [arquivo.name, arquivo]));
  return ordenarBackupsAutomaticos([...porNome.keys()]).map((info) => {
    const arquivo = porNome.get(info.nome);
    return { ...info, uri: arquivo?.uri ?? '', tamanhoBytes: arquivo?.size ?? 0 };
  });
}

/** Grava o backup no cache com o nome final, pronto para o compartilhamento do sistema. */
export function salvarParaCompartilhar(nome: string, backup: BackupCofre): string {
  const arquivo = new File(Paths.cache, nome);
  arquivo.create({ overwrite: true, intermediates: true });
  arquivo.writeSync(JSON.stringify(backup));
  return arquivo.uri;
}

/** Lê um arquivo e converte de JSON; null se não for JSON válido. */
export async function lerJson(uri: string): Promise<unknown> {
  const texto = await new File(uri).text();
  try {
    const conteudo: unknown = JSON.parse(texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);
    return conteudo;
  } catch {
    return null;
  }
}
