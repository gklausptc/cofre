import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useBloqueioStore } from '@/store/bloqueioStore';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { esperaAtualDoPin, tentarPin, zerarTentativasPin } from '@/core/auth/appLock';
import { autenticarComBiometria, biometriaDisponivel } from '@/core/auth/biometria';
import { descreverEspera } from '@/domain/usecases/bloqueioPin';
import { LogoMark } from '@/components/Logo';
import { NOME_DO_APP } from '@/core/marca';
import { PinPad } from '@/components/PinPad';

export function AppLockScreen() {
  const { colors } = useAppTheme();
  const desbloquear = useBloqueioStore((s) => s.desbloquear);
  const biometriaAtiva = usePreferenciasStore((s) => s.preferencias?.biometriaAtiva ?? false);

  const [pin, setPin] = useState('');
  const [erro, setErro] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // segundos até poder tentar o PIN de novo (bloqueio progressivo depois de 5 erros)
  const [espera, setEspera] = useState(0);
  const [tentandoBiometria, setTentandoBiometria] = useState(false);
  const bloqueado = espera > 0;

  // Tenta desbloquear via biometria assim que a tela abre — só a chamada às APIs
  // nativas acontece de forma síncrona aqui; todo setState vem depois de um await,
  // dentro dos `.then()`.
  useEffect(() => {
    if (!biometriaAtiva) return;
    let cancelado = false;

    biometriaDisponivel().then((disponivel) => {
      if (!disponivel || cancelado) return;
      setTentandoBiometria(true);
      autenticarComBiometria().then((ok) => {
        if (cancelado) return;
        setTentandoBiometria(false);
        // biometria também zera os erros de PIN
        if (ok) zerarTentativasPin().finally(desbloquear);
      });
    });

    return () => {
      cancelado = true;
    };
  }, [biometriaAtiva, desbloquear]);

  // Espera que ficou em vigor de uma abertura anterior do app
  useEffect(() => {
    esperaAtualDoPin().then(setEspera);
  }, []);

  useEffect(() => {
    if (!bloqueado) return;
    const relogio = setInterval(() => setEspera((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(relogio);
  }, [bloqueado]);

  function handleTentarBiometriaNovamente() {
    setTentandoBiometria(true);
    autenticarComBiometria().then((ok) => {
      setTentandoBiometria(false);
      if (ok) zerarTentativasPin().finally(desbloquear);
    });
  }

  function handleAlterarPin(novoValor: string) {
    if (bloqueado) return;
    setPin(novoValor);
    if (novoValor.length < 4) return;

    tentarPin(novoValor).then((resultado) => {
      if (resultado.ok) {
        desbloquear();
        return;
      }
      setErro(true);
      setEspera(resultado.esperaSegundos);
      setAviso(
        resultado.esperaSegundos === 0 && resultado.tentativasRestantes <= 2
          ? `PIN incorreto. Mais ${resultado.tentativasRestantes} ${
              resultado.tentativasRestantes === 1 ? 'tentativa' : 'tentativas'
            } antes de ter que esperar.`
          : 'PIN incorreto, tente de novo'
      );
      setTimeout(() => {
        setPin('');
        setErro(false);
      }, 400);
    });
  }

  const texto = bloqueado
    ? `Muitas tentativas erradas. Tente de novo em ${descreverEspera(espera)}.`
    : (aviso ?? 'Digite seu PIN para continuar');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <LogoMark size={56} />
      <Text className="font-heading" style={{ color: colors.text, fontSize: 20, marginTop: 16, marginBottom: 4 }}>
        {NOME_DO_APP} bloqueado
      </Text>
      <Text
        className="font-body"
        style={{
          color: bloqueado ? colors.warning : colors.textMuted,
          fontSize: 13,
          marginBottom: 32,
          paddingHorizontal: 32,
          textAlign: 'center',
        }}
      >
        {texto}
      </Text>

      <PinPad valor={pin} onAlterar={handleAlterarPin} erro={erro} />

      {biometriaAtiva && (
        <Pressable
          onPress={handleTentarBiometriaNovamente}
          disabled={tentandoBiometria}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, minHeight: 44 }}
        >
          <Feather name="smartphone" size={16} color={colors.brand} />
          <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
            Usar biometria
          </Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
