import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type Props = {
  /** null = escondido. */
  mensagem: string | null;
  acao?: { rotulo: string; onPress: () => void };
  onFechar: () => void;
  /** Some sozinho depois disso (ms). */
  duracao?: number;
};

/** Aviso curto no rodapé, com uma ação opcional ("Desfazer"). Some sozinho em 5 s. */
export function Snackbar({ mensagem, acao, onFechar, duracao = 5000 }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!mensagem) return;
    const timer = setTimeout(onFechar, duracao);
    return () => clearTimeout(timer);
  }, [mensagem, duracao, onFechar]);

  if (!mensagem) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + 16,
        // sempre escuro (como no sistema), com borda para destacar no tema escuro
        backgroundColor: '#0F1320',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Text className="font-body-medium" style={{ color: '#EEF1F8', fontSize: 13, flex: 1 }}>
        {mensagem}
      </Text>
      {acao && (
        <Pressable
          onPress={() => {
            acao.onPress();
            onFechar();
          }}
          accessibilityRole="button"
          hitSlop={10}
          style={{ minHeight: 32, justifyContent: 'center', marginLeft: 12 }}
        >
          <Text className="font-heading-medium" style={{ color: '#5B8CFF', fontSize: 13 }}>
            {acao.rotulo}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
