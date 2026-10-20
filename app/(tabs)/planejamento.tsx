import React, { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { GraficoProjecao } from '@/components/GraficoProjecao';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useParcelasStore } from '@/store/parcelasStore';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { projetarFluxoCaixa } from '@/domain/usecases/projetarFluxoCaixa';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia } from '@/core/utils/date';

const MESES_DA_PROJECAO = 6;

export default function PlanejamentoScreen() {
  const { colors } = useAppTheme();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { contas: contasFixas, carregar: carregarContasFixas } = useContasFixasStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();

  useFocusEffect(
    useCallback(() => {
      carregarParcelas();
      carregarMovimentacoes();
      carregarGastos();
      carregarContasFixas();
      carregarCompras();
      carregarCartoes();
    }, [
      carregarParcelas,
      carregarMovimentacoes,
      carregarGastos,
      carregarContasFixas,
      carregarCompras,
      carregarCartoes,
    ])
  );

  const projecao = useMemo(
    () => projetarFluxoCaixa(MESES_DA_PROJECAO, parcelas, movimentacoes, gastos, contasFixas, compras, cartoes),
    [parcelas, movimentacoes, gastos, contasFixas, compras, cartoes]
  );

  const temDados = projecao.some((p) => p.despesaPrevista > 0 || p.receitaPrevista > 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Planejamento" subtitle={`Projeção dos próximos ${MESES_DA_PROJECAO} meses`} />

        {!temDados ? (
          <EmptyState
            icon="trending-up"
            titulo="Sem projeção ainda"
            descricao="Assim que você tiver contas fixas e parcelas cadastradas, a projeção dos próximos meses aparece aqui."
          />
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                Receita, despesa e saldo previstos
              </Text>
              <GraficoProjecao projecao={projecao} />
            </Card>
            {projecao.map((item) => {
              const positivo = item.saldoPrevisto >= 0;
              return (
                <Card key={item.mes} style={{ borderColor: positivo ? colors.border : colors.danger }}>
                  <Text
                    className="font-heading-medium"
                    style={{ color: colors.text, fontSize: 15, textTransform: 'capitalize' }}
                  >
                    {formatarMesReferencia(item.mes)}
                  </Text>
                  <View style={{ flexDirection: 'row', marginTop: 12, gap: 24 }}>
                    <View>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                        Receita prevista
                      </Text>
                      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14 }}>
                        {formatarMoeda(item.receitaPrevista)}
                      </Text>
                    </View>
                    <View>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                        Despesa prevista
                      </Text>
                      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14 }}>
                        {formatarMoeda(item.despesaPrevista)}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                      Saldo previsto
                    </Text>
                    <Text
                      className="font-heading-medium"
                      style={{ color: positivo ? colors.success : colors.danger, fontSize: 18 }}
                    >
                      {positivo ? '+' : ''}
                      {formatarMoeda(item.saldoPrevisto)}
                    </Text>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
