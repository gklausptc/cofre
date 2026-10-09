import React from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
      <Text
        className="font-heading"
        style={{ color: colors.text, fontSize: 28 }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 14, marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
