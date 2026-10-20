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
import { formatarData, mesAtualIso } from '@/core/utils/date';
import { ConfigRendimentoForm } from '@/components/ConfigRendimentoForm';
import { PainelRendimento } from '@/components/PainelRendimento';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { descreverRendimento, type ConfigRendimento } from '@/domain/usecases/rendimento';
import { custoFixoMensal, mesesCobertos, sugerirMetaDaReserva, MESES_DA_RESERVA } from '@/domain/usecases/automacoes/simuladores';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useParcelasStore } from '@/store/parcelasStore';

type Modo = 'nenhum' | 'aportar' | 'retirar' | 'editar-meta' | 'editar-rendimento';

export default function ReservaEmergenciaScreen() {
  const { colors } = useAppTheme();
  const { reserva, historico, carregar, definirMeta, definirRendimento, aportar, retirar, removerReserva } =
    useReservaEmergenciaStore();
  const { preferencias, carregar: carregarPreferencias } = usePreferenciasStore();
  const { contas: contasFixas, carregar: carregarContasFixas } = useContasFixasStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const custo = custoFixoMensal(contasFixas, parcelas, mesAtualIso());
  const metaSugerida = sugerirMetaDaReserva(custo);
  const [rendimento, setRendimento] = useState<ConfigRendimento | null>(null);

  const [valorMeta, setValorMeta] = useState(0);
  const [meses, setMeses] = useState('6');
  const [valorMovimento, setValorMovimento] = useState(0);
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo] = useState<Modo>('nenhum');

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarPreferencias();
      carregarContasFixas();
      carregarParcelas();
    }, [carregar, carregarPreferencias, carregarContasFixas, carregarParcelas])
  );

  function iniciarEdicaoMeta() {
    setValorMeta(reserva?.valorMeta ?? 0);
    setMeses(reserva?.mesesCoberturaDesejados ? String(reserva.mesesCoberturaDesejados) : '6');
    setModo('editar-meta');
  }

  function iniciarEdicaoRendimento() {
    if (!reserva) return;
    setRendimento({
      indexador: reserva.indexador,
      percentualIndexador: reserva.percentualIndexador,
      cobraIr: reserva.cobraIr,
    });
    setModo('editar-rendimento');
  }

  async function handleSalvarRendimento() {
    if (!rendimento) return;
    setSalvando(true);
    try {
      await definirRendimento(rendimento);
      cancelarModo();
    } finally {
      setSalvando(false);
    }
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
    } catch (erro) {
      Alert.alert('Não foi possível retirar', erro instanceof Error ? erro.message : 'Tente novamente.');
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
              {custo > 0 && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                  {`Cobre ${String(mesesCobertos(reserva.valorAtual, custo) ?? 0).replace('.', ',')} meses do seu custo fixo (${formatarMoeda(custo)} por mês).`}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
                <Pressable onPress={iniciarEdicaoMeta} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                    Editar meta
                  </Text>
                </Pressable>
                <Pressable onPress={iniciarEdicaoRendimento} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                    Onde está aplicada: {descreverRendimento(reserva)}
                  </Text>
                </Pressable>
              </View>

              {modo === 'editar-rendimento' && rendimento && (
                <Card style={{ marginTop: 8 }}>
                  <ConfigRendimentoForm valor={rendimento} onAlterar={setRendimento} />
                  <View style={{ gap: 12 }}>
                    <Button titulo="Salvar" onPress={handleSalvarRendimento} carregando={salvando} />
                    <Button titulo="Cancelar" variante="secundaria" onPress={cancelarModo} />
                  </View>
                </Card>
              )}

              <View style={{ height: 12 }} />
              <PainelRendimento
                fluxos={historico.map((h) => ({ data: h.data, valor: h.tipo === 'aporte' ? h.valor : -h.valor }))}
                config={{
                  indexador: reserva.indexador,
                  percentualIndexador: reserva.percentualIndexador,
                  cobraIr: reserva.cobraIr,
                }}
                taxas={{ cdiAnual: preferencias?.taxaCdiAnual ?? null, selicAnual: preferencias?.taxaSelicAnual ?? null }}
                taxasAtualizadasEm={preferencias?.taxasAtualizadasEm ?? null}
                valorMeta={reserva.valorMeta}
              />

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
              {metaSugerida > 0 && (
                <Card style={{ marginBottom: 16 }}>
                  <Text className="font-body" style={{ color: colors.text, fontSize: 13 }}>
                    Sugestão: {formatarMoeda(metaSugerida)}, que são {MESES_DA_RESERVA} meses do seu custo fixo de{' '}
                    {formatarMoeda(custo)} (contas fixas e parcelas).
                  </Text>
                  <View style={{ marginTop: 10 }}>
                    <Button
                      titulo={`Usar ${formatarMoeda(metaSugerida)}`}
                      variante="secundaria"
                      onPress={() => {
                        setValorMeta(metaSugerida);
                        setMeses(String(MESES_DA_RESERVA));
                      }}
                    />
                  </View>
                </Card>
              )}
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
