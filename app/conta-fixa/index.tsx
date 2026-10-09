import React, { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { formatarMoeda } from '@/core/utils/currency';

const ROTULO_RECORRENCIA: Record<string, string> = {
  mensal: 'Mensal',
  quinzenal: 'Quinzenal',
  semanal: 'Semanal',
  anual: 'Anual',
  unica: 'Única',
};

export default function ContasFixasScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { contas, carregar } = useContasFixasStore();

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Contas fixas" subtitle="Contas recorrentes do mês a mês" />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {contas.length === 0 ? (
            <EmptyState
              icon="file-text"
              titulo="Nenhuma conta fixa"
              descricao="Cadastre aluguel, assinaturas e outras contas recorrentes para acompanhar os vencimentos."
            />
          ) : (
            contas.map((conta) => (
              <Pressable key={conta.id} onPress={() => router.push(`/conta-fixa/${conta.id}`)}>
                <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                      {conta.nome}
                    </Text>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      Todo dia {conta.diaVencimento} · {ROTULO_RECORRENCIA[conta.recorrencia]}
                    </Text>
                  </View>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                    {formatarMoeda(conta.valor)}
                  </Text>
                </Card>
              </Pressable>
            ))
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Button titulo="Nova conta fixa" onPress={() => router.push('/conta-fixa/novo')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
