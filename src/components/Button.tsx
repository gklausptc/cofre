import React from 'react';
import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type ButtonProps = {
  titulo: string;
  variante?: 'primaria' | 'secundaria' | 'perigo';
  carregando?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Button({ titulo, variante = 'primaria', carregando, disabled, style, onPress }: ButtonProps) {
  const { colors } = useAppTheme();

  const backgroundColor = {
    primaria: colors.brand,
    secundaria: colors.surface,
    perigo: colors.danger,
  }[variante];

  const textColor = variante === 'secundaria' ? colors.text : '#FFFFFF';

  return (
    <Pressable
      disabled={disabled || carregando}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor,
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: variante === 'secundaria' ? 1 : 0,
          borderColor: colors.border,
          opacity: disabled || pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text className="font-heading-medium" style={{ color: textColor, fontSize: 15 }}>
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}
