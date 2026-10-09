import React from 'react';
import { Switch, Text, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type SwitchRowProps = {
  titulo: string;
  descricao?: string;
  valor: boolean;
  onAlterar: (valor: boolean) => void;
};

export function SwitchRow({ titulo, descricao, valor, onAlterar }: SwitchRowProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 16,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
          {titulo}
        </Text>
        {descricao ? (
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {descricao}
          </Text>
        ) : null}
      </View>
      <Switch
        value={valor}
        onValueChange={onAlterar}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
