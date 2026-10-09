import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { PieChart } from 'react-native-gifted-charts';
import { addMonths, format } from 'date-fns';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MonthSelector } from '@/components/MonthSelector';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { calcularGastosPorCategoria } from '@/domain/usecases/calcularGastosPorCategoria';
import { calcularResumoMensal } from '@/domain/usecases/calcularResumoMensal';
import { formatarMoeda } from '@/core/utils/currency';

export default function RelatoriosScreen() {
  const { colors } = useAppTheme();
  const [mesReferencia, setMesReferencia] = useState(() => format(new Date(), 'yyyy-MM'));

  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();

  useFocusEffect(
    useCallback(() => {
      carregarMovimentacoes();
      carregarGastos();
      carregarParcelas();
      carregarCategorias();
    }, [carregarMovimentacoes, carregarGastos, carregarCategorias, carregarParcelas])
  );

  const gastosPorCategoria = useMemo(
    () => calcularGastosPorCategoria(movimentacoes, gastos, categorias, mesReferencia),
    [movimentacoes, gastos, categorias, mesReferencia]
  );
  const resumo = useMemo(
    () => calcularResumoMensal(movimentacoes, gastos, mesReferencia, parcelas),
    [movimentacoes, gastos, mesReferencia, parcelas]
  );

  const dadosGrafico = gastosPorCategoria.map((item) => ({
    value: item.total,
    color: item.cor,
    text: '',
  }));

  function mudarMes(delta: number) {
    setMesReferencia((atual) => format(addMonths(new Date(`${atual}-01`), delta), 'yyyy-MM'));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Relatórios" subtitle="Para onde seu dinheiro está indo" />
        <MonthSelector mesReferencia={mesReferencia} onAnterior={() => mudarMes(-1)} onProximo={() => mudarMes(1)} />

        {gastosPorCategoria.length === 0 ? (
          <EmptyState
            icon="pie-chart"
            titulo="Sem gastos neste mês"
            descricao="Lance movimentações ou gastos rápidos para ver o relatório por categoria."
          />
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <Card style={{ alignItems: 'center' }}>
              <PieChart
                data={dadosGrafico}
                radius={90}
                donut
                innerRadius={56}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                      Total gasto
                    </Text>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                      {formatarMoeda(resumo.despesas)}
                    </Text>
                  </View>
                )}
              />
            </Card>

            <View style={{ height: 16 }} />

            <Card style={{ paddingVertical: 4 }}>
              {gastosPorCategoria.map((item, index) => (
                <View
                  key={item.categoriaId ?? 'sem-categoria'}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View
                    style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.cor, marginRight: 10 }}
                  />
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                    {item.nome}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginRight: 8 }}>
                    {resumo.despesas > 0 ? Math.round((item.total / resumo.despesas) * 100) : 0}%
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                    {formatarMoeda(item.total)}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
