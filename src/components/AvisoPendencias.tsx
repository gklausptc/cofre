import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/core/theme/ThemeProvider';

/** Aviso âmbar no Início: "X itens precisam de você" (perguntas pendentes das importações). */
export function AvisoPendencias({ quantidade }: { quantidade: number }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  if (quantidade === 0) return null;
  return (
    <Pressable
      onPress={() => router.push('/revisao')}
      accessibilityRole="button"
      accessibilityLabel={`${quantidade} ${quantidade === 1 ? 'item precisa' : 'itens precisam'} de você. Abrir revisão`}
      style={{ marginHorizontal: 20, marginBottom: 12 }}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', borderColor: colors.warning }}>
        <Feather name="help-circle" size={20} color={colors.warning} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
            {quantidade} {quantidade === 1 ? 'item precisa' : 'itens precisam'} de você
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
            Dúvidas da importação do extrato
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}
