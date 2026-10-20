import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarCentesimos, textoParaCentesimos } from '@/core/utils/percentual';
import { formatarData, hojeIso } from '@/core/utils/date';
import { usePreferenciasStore } from '@/store/preferenciasStore';

/** Depois de tantos dias sem atualizar, a tela avisa que a taxa pode estar velha. */
const DIAS_PARA_AVISAR = 60;

function lerTaxa(texto: string): number | null | 'invalida' {
  if (texto.trim() === '') return null;
  const centesimos = textoParaCentesimos(texto);
  return Number.isFinite(centesimos) && centesimos > 0 && centesimos < 10000 ? centesimos : 'invalida';
}

export default function TaxasDeReferenciaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { preferencias, carregar, atualizar } = usePreferenciasStore();

  const [cdi, setCdi] = useState('');
  const [selic, setSelic] = useState('');
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  if (preferencias && !carregado) {
    setCarregado(true);
    setCdi(preferencias.taxaCdiAnual !== null ? formatarCentesimos(preferencias.taxaCdiAnual) : '');
    setSelic(preferencias.taxaSelicAnual !== null ? formatarCentesimos(preferencias.taxaSelicAnual) : '');
  }

  const taxaCdi = lerTaxa(cdi);
  const taxaSelic = lerTaxa(selic);
  const valido = taxaCdi !== 'invalida' && taxaSelic !== 'invalida';
  const atualizadaEm = preferencias?.taxasAtualizadasEm ?? null;
  const velha = atualizadaEm !== null && differenceInCalendarDays(new Date(), parseISO(atualizadaEm)) > DIAS_PARA_AVISAR;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await atualizar({ taxaCdiAnual: taxaCdi, taxaSelicAnual: taxaSelic, taxasAtualizadasEm: hojeIso() });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Taxas de referência" subtitle="Usadas para estimar o rendimento das metas" />

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Card>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
              O Cofre funciona sem internet, então não busca as taxas sozinho. Atualize aqui quando o Copom mudar a
              Selic (a cada 45 dias, no site do Banco Central). O CDI costuma ficar cerca de 0,10 ponto abaixo da
              Selic.
            </Text>
            <TextField
              label="CDI (% ao ano)"
              placeholder="Ex.: 14,90"
              keyboardType="decimal-pad"
              value={cdi}
              onChangeText={setCdi}
            />
            <TextField
              label="Selic (% ao ano)"
              placeholder="Ex.: 15,00"
              keyboardType="decimal-pad"
              value={selic}
              onChangeText={setSelic}
            />
            {!valido && (
              <Text className="font-body-medium" style={{ color: colors.danger, fontSize: 12, marginBottom: 12 }}>
                Digite as taxas como número, por exemplo 14,90.
              </Text>
            )}
            <Text
              className="font-body"
              style={{ color: velha ? colors.warning : colors.textMuted, fontSize: 12, marginBottom: 16 }}
            >
              {atualizadaEm
                ? `Atualizadas em ${formatarData(atualizadaEm)}${velha ? ' — confira se mudaram.' : '.'}`
                : 'Ainda não informadas.'}
            </Text>
            <Button titulo="Salvar taxas" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
