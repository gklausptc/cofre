import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Fotos de comprovante: ficam em `documentDirectory/comprovantes`, comprimidas (lado maior com
 * 1280 px, JPEG 0,6, uns 200 KB). O lançamento guarda só o caminho relativo
 * ("comprovantes/123.jpg"). As fotos não entram no backup em JSON.
 */
const PASTA = 'comprovantes';
const LADO_MAIOR = 1280;

function pasta(): Directory {
  const dir = new Directory(Paths.document, PASTA);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export type OrigemDaFoto = 'camera' | 'galeria';

/** Abre a câmera ou a galeria; devolve a imagem escolhida (ou null se cancelou ou negou). */
export async function escolherFoto(origem: OrigemDaFoto): Promise<{ uri: string; largura: number; altura: number } | null> {
  const permissao =
    origem === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) return null;
  const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const resultado = origem === 'camera' ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
  if (resultado.canceled || resultado.assets.length === 0) return null;
  const asset = resultado.assets[0];
  return { uri: asset.uri, largura: asset.width, altura: asset.height };
}

/** Comprime e guarda a foto no app; devolve o caminho relativo para gravar no lançamento. */
export async function guardarComprovante(foto: { uri: string; largura: number; altura: number }): Promise<string> {
  const contexto = ImageManipulator.manipulate(foto.uri);
  if (Math.max(foto.largura, foto.altura) > LADO_MAIOR) {
    contexto.resize(foto.largura >= foto.altura ? { width: LADO_MAIOR } : { height: LADO_MAIOR });
  }
  const imagem = await contexto.renderAsync();
  const salva = await imagem.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });
  const nome = `${Date.now()}.jpg`;
  await new File(salva.uri).move(new File(pasta(), nome));
  return `${PASTA}/${nome}`;
}

/** URI para mostrar a foto (null se o arquivo não está neste aparelho, ex.: depois de restaurar). */
export function uriDoComprovante(caminho: string | null): string | null {
  if (!caminho) return null;
  const arquivo = new File(Paths.document, caminho);
  return arquivo.exists ? arquivo.uri : null;
}

export function apagarComprovante(caminho: string | null): void {
  if (!caminho) return;
  const arquivo = new File(Paths.document, caminho);
  if (arquivo.exists) arquivo.delete();
}

/** Apaga todas as fotos de comprovante (usado por "Limpar todos os dados"). */
export function apagarTodosOsComprovantes(): void {
  const dir = new Directory(Paths.document, PASTA);
  if (dir.exists) dir.delete();
}

/** Quantas fotos e quantos bytes (para o aviso na tela de backup). */
export function resumoDosComprovantes(): { quantidade: number; bytes: number } {
  const dir = new Directory(Paths.document, PASTA);
  if (!dir.exists) return { quantidade: 0, bytes: 0 };
  const arquivos = dir.list().filter((item): item is File => item instanceof File);
  return { quantidade: arquivos.length, bytes: arquivos.reduce((s, a) => s + (a.size ?? 0), 0) };
}
