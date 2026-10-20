import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { gerarBackupAtual } from '@/core/backup/servicoBackup';
import { planilhaDaAnalise, type AnaliseCompleta } from '@/domain/usecases/analiseCompleta';

async function compartilhar(nome: string, conteudo: string, tipo: { mimeType: string; UTI: string }, titulo: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento não está disponível neste aparelho.');
  const arquivo = new File(Paths.cache, nome);
  arquivo.create({ overwrite: true, intermediates: true });
  arquivo.write(conteudo);
  await Sharing.shareAsync(arquivo.uri, { ...tipo, dialogTitle: titulo });
}

/**
 * Um arquivo com tudo para conferência: a análise (cada lançamento com natureza e sinal, os
 * números de cada mês, o saldo das contas) e o backup completo (os dados como estão gravados).
 * O PIN não vai: fica no SecureStore, fora do banco.
 */
export async function compartilharAnaliseCompleta(analise: AnaliseCompleta): Promise<void> {
  const agora = new Date();
  const dados = await gerarBackupAtual(agora);
  const conteudo = JSON.stringify({ formato: 'cofre-klaus-analise', versao: 1, analise, dados });
  await compartilhar(`cofre-analise-${format(agora, 'yyyy-MM-dd-HHmm')}.json`, conteudo, { mimeType: 'application/json', UTI: 'public.json' }, 'Enviar análise do Cofre');
}

/** Planilha com todos os lançamentos (abre no Excel em português). */
export async function compartilharPlanilhaDaAnalise(analise: AnaliseCompleta): Promise<void> {
  const nome = `cofre-lancamentos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  await compartilhar(nome, planilhaDaAnalise(analise), { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' }, 'Planilha de lançamentos');
}
