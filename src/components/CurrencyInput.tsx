import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';

type CurrencyInputProps = {
  label: string;
  /** valor em centavos (R$ 12,34 = 1234) */
  valor: number;
  onChangeValor: (centavos: number) => void;
};

export function CurrencyInput({ label, valor, onChangeValor }: CurrencyInputProps) {
  const { colors } = useAppTheme();

  function handleChangeText(texto: string) {
    const digitos = texto.replace(/\D/g, '');
    onChangeValor(digitos ? parseInt(digitos, 10) : 0);
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        className="font-body-medium"
        style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}
      >
        {label}
      </Text>
      <TextInput
        keyboardType="numeric"
        value={formatarMoeda(valor)}
        onChangeText={handleChangeText}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.text,
          fontSize: 20,
          fontFamily: 'Manrope_700Bold',
        }}
      />
    </View>
  );
}
