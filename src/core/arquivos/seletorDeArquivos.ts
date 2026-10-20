import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

/**
 * Abre o seletor de arquivos do sistema.
 *
 * No Android o arquivo é lido direto do endereço que o seletor devolve (`content://`): a cópia
 * no cache que o seletor faria fica numa pasta que o Expo Go não deixa o app abrir ("Missing
 * 'READ' permission for accessing the file"). No iPhone a cópia vai para a pasta do próprio app
 * e continua sendo o jeito seguro de ler o arquivo depois.
 */
export function abrirSeletorDeArquivos(tipos: string[], varios: boolean): Promise<DocumentPicker.DocumentPickerResult> {
  return DocumentPicker.getDocumentAsync({ type: tipos, copyToCacheDirectory: Platform.OS !== 'android', multiple: varios });
}
