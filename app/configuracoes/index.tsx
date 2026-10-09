import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { SwitchRow } from '@/components/SwitchRow';
import { Button } from '@/components/Button';
import { PinPad } from '@/components/PinPad';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { definirPin, removerPin } from '@/core/auth/appLock';
import { biometriaDisponivel } from '@/core/auth/biometria';
import { limparTodosOsDados } from '@/data/db/resetDatabase';
import type { Preferencias } from '@/domain/types/entities';

const OPCOES_TEMA: { valor: Preferencias['tema']; rotulo: string }[] = [
  { valor: 'sistema', rotulo: 'Sistema' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
];

type EtapaPin = 'inativo' | 'primeiro' | 'confirmar';

export default function ConfiguracoesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { preferencias, carregar, atualizar } = usePreferenciasStore();

  const [biometriaSuportada, setBiometriaSuportada] = useState(false);
  const [etapaPin, setEtapaPin] = useState<EtapaPin>('inativo');
  const [pinDigitado, setPinDigitado] = useState('');
  const [primeiroPin, setPrimeiroPin] = useState('');
  const [erroPin, setErroPin] = useState(false);
  const [limpando, setLimpando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  useEffect(() => {
    biometriaDisponivel().then(setBiometriaSuportada);
  }, []);

  const tema = preferencias?.tema ?? 'sistema';
  const bloqueioAtivo = preferencias?.bloqueioAtivo ?? false;
  const biometriaAtiva = preferencias?.biometriaAtiva ?? false;

  function iniciarDefinicaoPin() {
    setPrimeiroPin('');
    setPinDigitado('');
    setErroPin(false);
    setEtapaPin('primeiro');
  }

  function cancelarDefinicaoPin() {
    setEtapaPin('inativo');
    setPinDigitado('');
    setPrimeiroPin('');
    setErroPin(false);
  }

  function handleAlterarPin(novoValor: string) {
    setPinDigitado(novoValor);
    if (novoValor.length < 4) return;

    if (etapaPin === 'primeiro') {
      setPrimeiroPin(novoValor);
      setPinDigitado('');
      setEtapaPin('confirmar');
      return;
    }

    if (novoValor === primeiroPin) {
      definirPin(primeiroPin).then(() => {
        atualizar({ bloqueioAtivo: true });
        cancelarDefinicaoPin();
      });
    } else {
      setErroPin(true);
      setTimeout(() => {
        setPinDigitado('');
        setErroPin(false);
        setEtapaPin('primeiro');
      }, 500);
    }
  }

  function handleLimparDados() {
    Alert.alert(
      'Limpar todos os dados',
      'Isso apaga permanentemente contas, movimentações, cartões, cofrinhos, contas fixas, reserva e membros da família. Não pode ser desfeito.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo',
          style: 'destructive',
          onPress: async () => {
            setLimpando(true);
            try {
              await limparTodosOsDados();
              await removerPin();
              await carregar();
              router.replace('/(tabs)/dashboard');
            } finally {
              setLimpando(false);
            }
          },
        },
      ]
    );
  }

  function handleDesativarBloqueio() {
    Alert.alert('Desativar bloqueio', 'O app não vai mais pedir PIN pra abrir. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desativar',
        style: 'destructive',
        onPress: async () => {
          await removerPin();
          await atualizar({ bloqueioAtivo: false, biometriaAtiva: false });
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Configurações" subtitle="Aparência e privacidade" />

        <View style={{ paddingHorizontal: 20 }}>
          <Card style={{ marginBottom: 16 }}>
            <ChipSelect
              label="Tema"
              opcoes={OPCOES_TEMA}
              valor={tema}
              onSelecionar={(valor) => atualizar({ tema: valor })}
            />
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: -8 }}>
              &ldquo;Sistema&rdquo; segue o modo claro/escuro do seu aparelho.
            </Text>
          </Card>

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
              Bloqueio do app
            </Text>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
              Protege seus dados financeiros com um PIN de 4 dígitos ao abrir o app.
            </Text>

            {etapaPin !== 'inativo' ? (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, marginBottom: 16 }}>
                  {erroPin
                    ? 'Os PINs não coincidem, tente de novo'
                    : etapaPin === 'primeiro'
                      ? 'Digite o novo PIN'
                      : 'Confirme o novo PIN'}
                </Text>
                <PinPad valor={pinDigitado} onAlterar={handleAlterarPin} erro={erroPin} />
                <View style={{ marginTop: 16 }}>
                  <Text
                    className="font-body-medium"
                    style={{ color: colors.textMuted, fontSize: 13 }}
                    onPress={cancelarDefinicaoPin}
                  >
                    Cancelar
                  </Text>
                </View>
              </View>
            ) : bloqueioAtivo ? (
              <View style={{ gap: 12 }}>
                {biometriaSuportada && (
                  <SwitchRow
                    titulo="Desbloquear com biometria"
                    descricao="Usa Face ID / Touch ID / digital do aparelho, com o PIN como alternativa."
                    valor={biometriaAtiva}
                    onAlterar={(valor) => atualizar({ biometriaAtiva: valor })}
                  />
                )}
                <Button titulo="Alterar PIN" variante="secundaria" onPress={iniciarDefinicaoPin} />
                <Button titulo="Desativar bloqueio" variante="perigo" onPress={handleDesativarBloqueio} />
              </View>
            ) : (
              <Button titulo="Ativar bloqueio por PIN" onPress={iniciarDefinicaoPin} />
            )}
          </Card>

          <View style={{ height: 16 }} />

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
              Zona de perigo
            </Text>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
              Apaga todos os dados cadastrados no app e recomeça do zero, mantendo só as categorias padrão.
            </Text>
            <Button
              titulo="Limpar todos os dados"
              variante="perigo"
              onPress={handleLimparDados}
              carregando={limpando}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
