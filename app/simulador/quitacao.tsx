import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia, mesAtualIso } from '@/core/utils/date';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { simularQuitacao } from '@/domain/usecases/automacoes/simuladores';

const nomeDoMes = (mes: string) => formatarMesReferencia(mes).split(' ')[0];

/** Simulador de quitação: quanto custa adiantar as parcelas de cada compra e quanto libera por mês. */
export default function QuitacaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, carregarTudo } = useDadosFinanceiros();

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
    }, [carregarTudo])
  );

  const simulacoes = useMemo(() => {
    const mes = mesAtualIso();
    return (dados.comprasParceladas ?? [])
      .map((c) => simularQuitacao(c, dados.parcelas ?? [], dados.cartoes ?? [], mes))
      .filter((s) => s !== null)
      .sort((a, b) => b.liberaPorMes - a.liberaPorMes);
  }, [dados]);
  const totalLiberado = simulacoes.reduce((s, q) => s + q.liberaPorMes, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Adiantar parcelas" subtitle="Quanto libera por mês se quitar agora" />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {simulacoes.length === 0 ? (
            <EmptyState icon="check-circle" titulo="Nenhuma parcela futura" descricao="Compras parceladas com parcelas nos próximos meses aparecem aqui." />
          ) : (
            <>
              <Card>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                  Se quitar tudo, deixa de sair por mês até
                </Text>
                <Text className="font-heading" style={{ color: colors.text, fontSize: 24 }}>
                  {formatarMoeda(totalLiberado)}
                </Text>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                  Peça ao banco o valor com desconto de juros antes de adiantar.
                </Text>
              </Card>
              {simulacoes.map((q) => (
                <Pressable key={q.compraId} onPress={() => router.push(`/compra-parcelada/${q.compraId}`)} accessibilityRole="button">
                  <Card>
                    <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
                      {q.descricao}
                    </Text>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      Faltam {q.parcelasRestantes} {q.parcelasRestantes === 1 ? 'parcela' : 'parcelas'}: {formatarMoeda(q.totalRestante)} para quitar
                    </Text>
                    <Text className="font-body-medium" style={{ color: colors.success, fontSize: 13, marginTop: 6 }}>
                      Libera {formatarMoeda(q.liberaPorMes)} por mês de {nomeDoMes(q.meses[0])} a {nomeDoMes(q.meses[q.meses.length - 1])}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
