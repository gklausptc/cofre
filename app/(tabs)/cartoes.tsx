import React, { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCartoesStore } from '@/store/cartoesStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';
import { formatarMoeda } from '@/core/utils/currency';

export default function CartoesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();

  useFocusEffect(
    useCallback(() => {
      carregarCartoes();
      carregarCompras();
      carregarParcelas();
      carregarGastos();
    }, [carregarCartoes, carregarCompras, carregarParcelas, carregarGastos])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Cartões" subtitle="Limite disponível e parcelas em aberto" />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {cartoes.length === 0 ? (
            <EmptyState
              icon="credit-card"
              titulo="Nenhum cartão cadastrado"
              descricao="Cadastre seus cartões de crédito para acompanhar limite disponível e compras parceladas."
            />
          ) : (
            cartoes.map((cartao) => {
              const disponivel = calcularLimiteDisponivel(cartao, compras, parcelas, gastos);
              return (
                <Pressable key={cartao.id} onPress={() => router.push(`/cartao/${cartao.id}`)}>
                  <Card style={{ backgroundColor: cartao.cor, borderWidth: 0 }}>
                    <Text className="font-body-medium" style={{ color: '#FFFFFF', fontSize: 13, opacity: 0.85 }}>
                      {cartao.nome}
                    </Text>
                    <Text className="font-heading" style={{ color: '#FFFFFF', fontSize: 22, marginTop: 4 }}>
                      {formatarMoeda(disponivel)}
                    </Text>
                    <Text className="font-body" style={{ color: '#FFFFFF', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                      disponível de {formatarMoeda(cartao.limite)}
                    </Text>
                  </Card>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Button titulo="Novo cartão" onPress={() => router.push('/cartao/novo')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
