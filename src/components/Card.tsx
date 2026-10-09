import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';

export function Card({ style, children, ...rest }: ViewProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 16,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
