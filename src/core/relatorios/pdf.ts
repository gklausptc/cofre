import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/** Gera o PDF a partir do HTML e abre a folha de compartilhar (Arquivos, WhatsApp, e-mail…). */
export async function gerarECompartilharPdf(html: string, nomeDoArquivo: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const destino = new File(Paths.cache, nomeDoArquivo);
  if (destino.exists) destino.delete();
  await new File(uri).move(destino);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhar não está disponível neste aparelho.');
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: nomeDoArquivo });
}
