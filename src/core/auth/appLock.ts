import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  lerTentativasPin,
  registrarFalhaPin,
  segundosDeEspera,
  SEM_FALHAS,
  tentativasAntesDeEsperar,
  type TentativasPin,
} from '@/domain/usecases/bloqueioPin';

const CHAVE_PIN = 'cofre_pin';
const CHAVE_TENTATIVAS = 'cofre_pin_tentativas';

/**
 * PIN de bloqueio do app, guardado no SecureStore (Keychain/Keystore do sistema), fora do
 * SQLite e fora do backup. Não é "senha de conta" (o app não tem backend): é uma tranca
 * local para ninguém abrir o app e ver seus dados. Grava só um hash SHA-256 com salt, nunca
 * o PIN; PINs gravados por versões antigas (o número puro) são convertidos no primeiro acerto.
 */
type PinGuardado = { versao: 1; salt: string; hash: string };

function paraHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function calcularHash(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function lerPinGuardado(texto: string): PinGuardado | null {
  try {
    const valor: unknown = JSON.parse(texto);
    if (typeof valor !== 'object' || valor === null) return null;
    const { versao, salt, hash } = valor as Record<string, unknown>;
    if (versao !== 1 || typeof salt !== 'string' || typeof hash !== 'string') return null;
    return { versao, salt, hash };
  } catch {
    return null;
  }
}

async function gravarTentativas(tentativas: TentativasPin): Promise<void> {
  await SecureStore.setItemAsync(CHAVE_TENTATIVAS, JSON.stringify(tentativas));
}

async function lerTentativas(): Promise<TentativasPin> {
  return lerTentativasPin(await SecureStore.getItemAsync(CHAVE_TENTATIVAS));
}

export async function definirPin(pin: string): Promise<void> {
  const salt = paraHex(Crypto.getRandomBytes(16));
  const guardado: PinGuardado = { versao: 1, salt, hash: await calcularHash(pin, salt) };
  await SecureStore.setItemAsync(CHAVE_PIN, JSON.stringify(guardado));
  await gravarTentativas(SEM_FALHAS);
}

export async function removerPin(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE_PIN);
  await SecureStore.deleteItemAsync(CHAVE_TENTATIVAS);
}

export async function existePin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CHAVE_PIN)) !== null;
}

/** Confere o PIN, sem contar tentativas (use `tentarPin` nas telas). */
async function pinConfere(pin: string): Promise<boolean> {
  const salvo = await SecureStore.getItemAsync(CHAVE_PIN);
  if (salvo === null) return false;

  const guardado = lerPinGuardado(salvo);
  if (guardado) return (await calcularHash(pin, guardado.salt)) === guardado.hash;

  // versão antiga: o PIN puro; acertou → passa a guardar só o hash
  if (salvo !== pin) return false;
  await definirPin(pin);
  return true;
}

export type ResultadoTentativaPin =
  | { ok: true }
  | {
      ok: false;
      /** Segundos até poder tentar de novo (0 = pode tentar já). */
      esperaSegundos: number;
      /** Erros que ainda dá para cometer antes de ter que esperar. */
      tentativasRestantes: number;
    };

/** Confere o PIN aplicando o bloqueio progressivo depois de 5 erros seguidos. */
export async function tentarPin(pin: string, agora: number = Date.now()): Promise<ResultadoTentativaPin> {
  const tentativas = await lerTentativas();
  const espera = segundosDeEspera(tentativas, agora);
  if (espera > 0) return { ok: false, esperaSegundos: espera, tentativasRestantes: 0 };

  if (await pinConfere(pin)) {
    await gravarTentativas(SEM_FALHAS);
    return { ok: true };
  }

  const novas = registrarFalhaPin(tentativas, agora);
  await gravarTentativas(novas);
  return { ok: false, esperaSegundos: segundosDeEspera(novas, agora), tentativasRestantes: tentativasAntesDeEsperar(novas) };
}

/** Espera ainda em vigor (por exemplo, se o app foi fechado no meio dela). */
export async function esperaAtualDoPin(agora: number = Date.now()): Promise<number> {
  return segundosDeEspera(await lerTentativas(), agora);
}

/** Desbloqueio por biometria também zera os erros. */
export async function zerarTentativasPin(): Promise<void> {
  await gravarTentativas(SEM_FALHAS);
}
