import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { EmptyState } from './EmptyState';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type ComingSoonProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  titulo: string;
  descricao: string;
};

/** Placeholder de tela para rotas já roteadas mas cuja lógica de negócio ainda não foi implementada (ver roadmap no CLAUDE.md, seção 10). */
export function ComingSoon({ icon, titulo, descricao }: ComingSoonProps) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState icon={icon} titulo={titulo} descricao={descricao} />
      </View>
    </SafeAreaView>
  );
}
