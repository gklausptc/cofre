import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMesReferencia } from '@/core/utils/date';

type MonthSelectorProps = {
  mesReferencia: string;
  onAnterior: () => void;
  onProximo: () => void;
};

export function MonthSelector({ mesReferencia, onAnterior, onProximo }: MonthSelectorProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 16,
      }}
    >
      <Pressable onPress={onAnterior} hitSlop={12}>
        <Feather name="chevron-left" size={20} color={colors.text} />
      </Pressable>
      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, textTransform: 'capitalize' }}>
        {formatarMesReferencia(mesReferencia)}
      </Text>
      <Pressable onPress={onProximo} hitSlop={12}>
        <Feather name="chevron-right" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}
