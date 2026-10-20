import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FabButton } from '@/components/FabButton';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { unificarLancamentos } from '@/domain/usecases/unificarLancamentos';
import { formatarData } from '@/core/utils/date';
import { formatarMoeda } from '@/core/utils/currency';

export default function LancamentosScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();

  useFocusEffect(
    useCallback(() => {
      carregarMovimentacoes();
      carregarGastos();
      carregarMembros();
    }, [carregarMovimentacoes, carregarGastos, carregarMembros])
  );

  const lancamentos = useMemo(
    () => unificarLancamentos(movimentacoes, gastos),
    [movimentacoes, gastos]
  );

  const membrosPorId = useMemo(() => new Map(membros.map((m) => [m.id, m])), [membros]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 }}>
          <ScreenHeader title="Lançamentos" subtitle="Movimentações e gastos rápidos" />
          <Pressable
            onPress={() => router.push('/busca')}
            accessibilityRole="button"
            accessibilityLabel="Buscar lançamentos"
            hitSlop={8}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', marginRight: 8 }}
          >
            <Feather name="search" size={20} color={colors.brand} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/movimentacao/novo')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        {lancamentos.length === 0 ? (
          <EmptyState
            icon="list"
            titulo="Nenhuma movimentação"
            descricao="Toque no botão + no canto para lançar uma movimentação, ou no botão flutuante para um gasto rápido."
          />
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 10 }}>
            {lancamentos.map((item) => {
              const membro = item.membroId ? membrosPorId.get(item.membroId) : undefined;
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push(
                      item.tipoOrigem === 'movimentacao'
                        ? `/movimentacao/${item.origemId}`
                        : `/gasto-rapido/${item.origemId}`
                    )
                  }
                >
                  <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
                          {item.descricao}
                        </Text>
                        {item.reservarProximoMes && (
                          <Feather name="clock" size={12} color={colors.textMuted} />
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                          {formatarData(item.data)}
                        </Text>
                        {membro && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>·</Text>
                            <View
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: membro.cor,
                              }}
                            />
                            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                              {membro.nome}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text
                      className="font-heading-medium"
                      style={{ color: item.saida ? colors.danger : colors.success, fontSize: 14 }}
                    >
                      {item.saida ? '-' : '+'}
                      {formatarMoeda(item.valor)}
                    </Text>
                    <Feather name="chevron-right" size={16} color={colors.textMuted} style={{ marginLeft: 8 }} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
      <FabButton />
    </SafeAreaView>
  );
}
