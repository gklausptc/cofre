import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useBloqueioStore } from '@/store/bloqueioStore';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { verificarPin } from '@/core/auth/appLock';
import { autenticarComBiometria, biometriaDisponivel } from '@/core/auth/biometria';
import { LogoMark } from '@/components/Logo';
import { PinPad } from '@/components/PinPad';

export function AppLockScreen() {
  const { colors } = useAppTheme();
  const desbloquear = useBloqueioStore((s) => s.desbloquear);
  const biometriaAtiva = usePreferenciasStore((s) => s.preferencias?.biometriaAtiva ?? false);

  const [pin, setPin] = useState('');
  const [erro, setErro] = useState(false);
  const [tentandoBiometria, setTentandoBiometria] = useState(false);

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
        if (ok) desbloquear();
      });
    });

    return () => {
      cancelado = true;
    };
  }, [biometriaAtiva, desbloquear]);

  function handleTentarBiometriaNovamente() {
    setTentandoBiometria(true);
    autenticarComBiometria().then((ok) => {
      setTentandoBiometria(false);
      if (ok) desbloquear();
    });
  }

  function handleAlterarPin(novoValor: string) {
    setPin(novoValor);
    if (novoValor.length < 4) return;

    verificarPin(novoValor).then((ok) => {
      if (ok) {
        desbloquear();
        return;
      }
      setErro(true);
      setTimeout(() => {
        setPin('');
        setErro(false);
      }, 400);
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <LogoMark size={56} />
      <Text className="font-heading" style={{ color: colors.text, fontSize: 20, marginTop: 16, marginBottom: 4 }}>
        Cofre bloqueado
      </Text>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 32 }}>
        {erro ? 'PIN incorreto, tente de novo' : 'Digite seu PIN para continuar'}
      </Text>

      <PinPad valor={pin} onAlterar={handleAlterarPin} erro={erro} />

      {biometriaAtiva && (
        <Pressable
          onPress={handleTentarBiometriaNovamente}
          disabled={tentandoBiometria}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 }}
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
