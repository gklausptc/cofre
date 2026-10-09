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
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';

export default function MembrosFamiliaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { membros, carregar, remover } = useMembrosFamiliaStore();

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Membros da família" subtitle="Para filtrar e agrupar gastos por pessoa" />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {membros.length === 0 ? (
            <EmptyState
              icon="users"
              titulo="Nenhum membro cadastrado"
              descricao="Adicione as pessoas da família para filtrar contas e gastos por membro."
            />
          ) : (
            membros.map((membro) => (
              <Card key={membro.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: membro.cor,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Feather name="user" size={16} color="#FFFFFF" />
                </View>
                <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                  {membro.nome}
                </Text>
                <Pressable onPress={() => remover(membro.id)}>
                  <Feather name="trash-2" size={18} color={colors.textMuted} />
                </Pressable>
              </Card>
            ))
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Button titulo="Novo membro" onPress={() => router.push('/membro/novo')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
