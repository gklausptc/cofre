import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from './Card';
import { Button } from './Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type EmptyStateProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  titulo: string;
  descricao: string;
  /** Estado vazio sempre que possível com uma ação ("Importe seu primeiro extrato"). */
  acao?: { rotulo: string; onPress: () => void };
};

export function EmptyState({ icon, titulo, descricao, acao }: EmptyStateProps) {
  const { colors } = useAppTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 32, marginHorizontal: 20 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <Feather name={icon} size={22} color={colors.brand} />
      </View>
      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16, marginBottom: 4 }}>
        {titulo}
      </Text>
      <Text
        className="font-body"
        style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}
      >
        {descricao}
      </Text>
      {acao && (
        <View style={{ marginTop: 16, alignSelf: 'stretch', paddingHorizontal: 24 }}>
          <Button titulo={acao.rotulo} onPress={acao.onPress} />
        </View>
      )}
    </Card>
  );
}
