import React, { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ProgressCard } from '@/components/ProgressCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCofrinhosStore } from '@/store/cofrinhosStore';
import { useAportesCofrinhoStore } from '@/store/aportesCofrinhoStore';
import { calcularProgressoCofrinho } from '@/domain/usecases/calcularProgressoCofrinho';

export default function CofrinhosScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { cofrinhos, carregar: carregarCofrinhos } = useCofrinhosStore();
  const { aportes, carregar: carregarAportes } = useAportesCofrinhoStore();

  useFocusEffect(
    useCallback(() => {
      carregarCofrinhos();
      carregarAportes();
    }, [carregarCofrinhos, carregarAportes])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Cofrinhos" subtitle="Suas metas de economia" />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {cofrinhos.length === 0 ? (
            <EmptyState
              icon="gift"
              titulo="Nenhum cofrinho"
              descricao="Crie um cofrinho para juntar dinheiro para uma viagem, compra ou objetivo."
            />
          ) : (
            cofrinhos.map((cofrinho) => {
              const progresso = calcularProgressoCofrinho(
                cofrinho,
                aportes.filter((a) => a.cofrinhoId === cofrinho.id)
              );
              return (
                <Pressable key={cofrinho.id} onPress={() => router.push(`/cofrinho/${cofrinho.id}`)}>
                  <ProgressCard
                    titulo={cofrinho.nome}
                    cor={cofrinho.cor}
                    valorAtual={progresso.valorAtual}
                    valorMeta={cofrinho.valorMeta}
                    percentual={progresso.percentual}
                    legenda={
                      cofrinho.status === 'concluido'
                        ? 'Meta concluída 🎉'
                        : progresso.previsaoMeses
                          ? `Previsão: ${progresso.previsaoMeses} mês${progresso.previsaoMeses === 1 ? '' : 'es'}`
                          : undefined
                    }
                  />
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Button titulo="Novo cofrinho" onPress={() => router.push('/cofrinho/novo')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
