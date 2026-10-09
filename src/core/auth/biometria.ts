import * as LocalAuthentication from 'expo-local-authentication';

export async function biometriaDisponivel(): Promise<boolean> {
  try {
    const suportado = await LocalAuthentication.hasHardwareAsync();
    const cadastrado = await LocalAuthentication.isEnrolledAsync();
    return suportado && cadastrado;
  } catch {
    return false;
  }
}

export async function autenticarComBiometria(): Promise<boolean> {
  try {
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquear o Cofre',
      cancelLabel: 'Usar PIN',
    });
    return resultado.success;
  } catch {
    return false;
  }
}
