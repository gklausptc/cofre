import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { ListaDeAcoes } from '@/components/FolhaDeAcoes';

/**
 * As ações do (+) como tela (para links e atalhos). O botão do meio e o (+) do Extrato abrem a
 * mesma lista numa folha própria (`FolhaDeAcoes`), sem passar por esta rota.
 */
export default function AcoesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ListaDeAcoes onEscolher={(href) => router.replace(href)} />
      </ScrollView>
    </View>
  );
}
