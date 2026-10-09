import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type Opcao<T extends string> = { valor: T; rotulo: string };

type ChipSelectProps<T extends string> = {
  label: string;
  opcoes: Opcao<T>[];
  valor: T;
  onSelecionar: (valor: T) => void;
};

export function ChipSelect<T extends string>({ label, opcoes, valor, onSelecionar }: ChipSelectProps<T>) {
  const { colors } = useAppTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opcoes.map((opcao) => {
          const ativo = opcao.valor === valor;
          return (
            <Pressable
              key={opcao.valor}
              onPress={() => onSelecionar(opcao.valor)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: ativo ? colors.brand : colors.surface,
                borderWidth: 1,
                borderColor: ativo ? colors.brand : colors.border,
              }}
            >
              <Text className="font-body-medium" style={{ color: ativo ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                {opcao.rotulo}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
