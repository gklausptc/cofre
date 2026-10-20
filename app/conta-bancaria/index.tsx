import React, { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { formatarMoeda } from '@/core/utils/currency';

export default function ContasBancariasScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarMovimentacoes();
      carregarGastos();
    }, [carregarContas, carregarMovimentacoes, carregarGastos])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Contas bancárias" subtitle="Saldo calculado a partir das movimentações" />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {contas.length === 0 ? (
            <EmptyState
              icon="dollar-sign"
              titulo="Nenhuma conta cadastrada"
              descricao="Cadastre sua primeira conta bancária para começar a lançar movimentações."
            />
          ) : (
            contas.map((conta) => {
              const saldo = calcularSaldoConta(conta, movimentacoes, gastos);
              return (
                <Pressable key={conta.id} onPress={() => router.push(`/conta-bancaria/${conta.id}`)}>
                  <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: conta.cor,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Feather name="dollar-sign" size={18} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                        {conta.nomeConta}
                      </Text>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                        {conta.banco}
                      </Text>
                    </View>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                      {formatarMoeda(saldo)}
                    </Text>
                  </Card>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Button titulo="Nova conta bancária" onPress={() => router.push('/conta-bancaria/novo')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
