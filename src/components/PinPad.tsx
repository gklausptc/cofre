import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';

const TAMANHO_PIN = 4;
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'apagar'];

type PinPadProps = {
  valor: string;
  onAlterar: (valor: string) => void;
  erro?: boolean;
};

/** Indicador de bolinhas + teclado numérico para entrada de PIN de 4 dígitos. */
export function PinPad({ valor, onAlterar, erro }: PinPadProps) {
  const { colors } = useAppTheme();

  function handleTecla(tecla: string) {
    if (tecla === '') return;
    if (tecla === 'apagar') {
      onAlterar(valor.slice(0, -1));
      return;
    }
    if (valor.length >= TAMANHO_PIN) return;
    onAlterar(valor + tecla);
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 32 }}>
        {Array.from({ length: TAMANHO_PIN }, (_, i) => (
          <View
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: i < valor.length ? (erro ? colors.danger : colors.brand) : 'transparent',
              borderWidth: 1.5,
              borderColor: erro ? colors.danger : colors.border,
            }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 3 * 72, justifyContent: 'center' }}>
        {TECLAS.map((tecla, index) => (
          <Pressable
            key={`${tecla}-${index}`}
            disabled={tecla === ''}
            onPress={() => handleTecla(tecla)}
            style={{
              width: 72,
              height: 64,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {tecla === 'apagar' ? (
              <Feather name="delete" size={22} color={colors.text} />
            ) : (
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 24 }}>
                {tecla}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
