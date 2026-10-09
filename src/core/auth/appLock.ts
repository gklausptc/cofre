import * as SecureStore from 'expo-secure-store';

const CHAVE_PIN = 'cofre_pin';

/**
 * PIN de bloqueio do app. Guardado no SecureStore (Keychain/Keystore do sistema),
 * fora do SQLite — não é "senha de conta" (o app não tem backend/contas), é só uma
 * tranca local pra alguém não abrir o app e ver seus dados financeiros.
 */
export async function definirPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(CHAVE_PIN, pin);
}

export async function removerPin(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE_PIN);
}

export async function existePin(): Promise<boolean> {
  const salvo = await SecureStore.getItemAsync(CHAVE_PIN);
  return salvo !== null;
}

export async function verificarPin(pin: string): Promise<boolean> {
  const salvo = await SecureStore.getItemAsync(CHAVE_PIN);
  return salvo !== null && salvo === pin;
}
