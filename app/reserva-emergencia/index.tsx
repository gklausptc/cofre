import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ProgressCard } from '@/components/ProgressCard';
import { CurrencyInput } from '@/components/CurrencyInput';
import { TextField } from '@/components/TextField';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useReservaEmergenciaStore } from '@/store/reservaEmergenciaStore';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';

type Modo = 'nenhum' | 'aportar' | 'retirar' | 'editar-meta';

export default function ReservaEmergenciaScreen() {
  const { colors } = useAppTheme();
  const { reserva, historico, carregar, definirMeta, aportar, retirar, removerReserva } =
    useReservaEmergenciaStore();

  const [valorMeta, setValorMeta] = useState(0);
  const [meses, setMeses] = useState('6');
  const [valorMovimento, setValorMovimento] = useState(0);
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo] = useState<Modo>('nenhum');

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  function iniciarEdicaoMeta() {
    setValorMeta(reserva?.valorMeta ?? 0);
    setMeses(reserva?.mesesCoberturaDesejados ? String(reserva.mesesCoberturaDesejados) : '6');
    setModo('editar-meta');
  }

  function cancelarModo() {
    setModo('nenhum');
    setValorMovimento(0);
    setJustificativa('');
  }

  async function handleDefinirMeta() {
    if (valorMeta <= 0) return;
    setSalvando(true);
    try {
      await definirMeta(valorMeta, parseInt(meses, 10) || null);
      setModo('nenhum');
    } finally {
      setSalvando(false);
    }
  }

  async function handleAportar() {
    if (valorMovimento <= 0) return;
    setSalvando(true);
    try {
      await aportar(valorMovimento);
      cancelarModo();
    } finally {
      setSalvando(false);
    }
  }

  async function handleRetirar() {
    if (valorMovimento <= 0 || justificativa.trim().length === 0) return;
    setSalvando(true);
    try {
      await retirar(valorMovimento, justificativa.trim());
      cancelarModo();
    } finally {
      setSalvando(false);
    }
  }

  function handleRemoverReserva() {
    Alert.alert(
      'Remover reserva de emergência',
      'Isso apaga a meta e todo o histórico de aportes/retiradas. Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await removerReserva();
            cancelarModo();
          },
        },
      ]
    );
  }

  const validoRetirada = valorMovimento > 0 && justificativa.trim().length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Reserva de emergência" subtitle="Sua rede de segurança financeira" />

        <View style={{ paddingHorizontal: 20 }}>
          {reserva && modo !== 'editar-meta' && (
            <>
              <ProgressCard
                titulo="Reserva atual"
                cor={colors.brand}
                valorAtual={reserva.valorAtual}
                valorMeta={reserva.valorMeta}
                percentual={reserva.valorMeta > 0 ? Math.min(reserva.valorAtual / reserva.valorMeta, 1) : 0}
                legenda={
                  reserva.mesesCoberturaDesejados
                    ? `Meta para ${reserva.mesesCoberturaDesejados} meses de cobertura`
                    : undefined
                }
              />
              <Pressable onPress={iniciarEdicaoMeta} style={{ alignSelf: 'flex-start', marginTop: 10 }}>
                <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                  Editar meta
                </Text>
              </Pressable>

              <View style={{ height: 20 }} />

              {modo === 'nenhum' && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Button titulo="Guardar" onPress={() => setModo('aportar')} style={{ flex: 1 }} />
                  <Button
                    titulo="Retirar"
                    variante="secundaria"
                    onPress={() => setModo('retirar')}
                    style={{ flex: 1 }}
                  />
                </View>
              )}

              {modo === 'aportar' && (
                <>
                  <CurrencyInput label="Adicionar à reserva" valor={valorMovimento} onChangeValor={setValorMovimento} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Button
                      titulo="Guardar"
                      onPress={handleAportar}
                      disabled={valorMovimento <= 0}
                      carregando={salvando}
                      style={{ flex: 1 }}
                    />
                    <Button titulo="Cancelar" variante="secundaria" onPress={cancelarModo} style={{ flex: 1 }} />
                  </View>
                </>
              )}

              {modo === 'retirar' && (
                <>
                  <CurrencyInput label="Retirar da reserva" valor={valorMovimento} onChangeValor={setValorMovimento} />
                  <TextField
                    label="Motivo da retirada"
                    placeholder="Ex.: Conserto do carro"
                    value={justificativa}
                    onChangeText={setJustificativa}
                  />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Button
                      titulo="Retirar"
                      variante="perigo"
                      onPress={handleRetirar}
                      disabled={!validoRetirada}
                      carregando={salvando}
                      style={{ flex: 1 }}
                    />
                    <Button titulo="Cancelar" variante="secundaria" onPress={cancelarModo} style={{ flex: 1 }} />
                  </View>
                </>
              )}

              {historico.length > 0 && (
                <>
                  <View style={{ height: 24 }} />
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 10 }}>
                    Histórico
                  </Text>
                  <View style={{ gap: 8 }}>
                    {historico.map((item) => (
                      <Card key={item.id}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                            {formatarData(item.data)}
                          </Text>
                          <Text
                            className="font-heading-medium"
                            style={{ color: item.tipo === 'aporte' ? colors.success : colors.danger, fontSize: 13 }}
                          >
                            {item.tipo === 'aporte' ? '+' : '-'}
                            {formatarMoeda(item.valor)}
                          </Text>
                        </View>
                        {item.justificativa && (
                          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                            {item.justificativa}
                          </Text>
                        )}
                      </Card>
                    ))}
                  </View>
                </>
              )}

              <View style={{ height: 24 }} />
              <Button titulo="Remover reserva" variante="perigo" onPress={handleRemoverReserva} />
            </>
          )}

          {(!reserva || modo === 'editar-meta') && (
            <>
              <CurrencyInput label="Meta da reserva" valor={valorMeta} onChangeValor={setValorMeta} />
              <TextField
                label="Meses de cobertura desejados (opcional)"
                keyboardType="numeric"
                value={meses}
                onChangeText={setMeses}
              />
              <View style={{ gap: 12 }}>
                <Button
                  titulo={reserva ? 'Salvar meta' : 'Definir meta'}
                  onPress={handleDefinirMeta}
                  disabled={valorMeta <= 0}
                  carregando={salvando}
                />
                {reserva && (
                  <Button titulo="Cancelar" variante="secundaria" onPress={() => setModo('nenhum')} />
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
