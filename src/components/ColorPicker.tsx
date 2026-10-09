import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';

export const CORES_DISPONIVEIS = [
  '#2D6A4F',
  '#40916C',
  '#1B4332',
  '#D97706',
  '#F59E0B',
  '#C1443C',
  '#6B6F68',
  '#3D5A80',
];

type ColorPickerProps = {
  cor: string;
  onSelecionar: (cor: string) => void;
};

export function ColorPicker({ cor, onSelecionar }: ColorPickerProps) {
  const { colors } = useAppTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        Cor
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {CORES_DISPONIVEIS.map((opcao) => {
          const selecionada = opcao === cor;
          return (
            <Pressable
              key={opcao}
              onPress={() => onSelecionar(opcao)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: opcao,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: selecionada ? 2 : 0,
                borderColor: colors.text,
              }}
            >
              {selecionada ? <Feather name="check" size={16} color="#FFFFFF" /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
