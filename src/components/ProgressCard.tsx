import React from 'react';
import { Text, View } from 'react-native';
import { Card } from './Card';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';

type ProgressCardProps = {
  titulo: string;
  cor: string;
  valorAtual: number;
  valorMeta: number;
  percentual: number;
  legenda?: string;
};

export function ProgressCard({ titulo, cor, valorAtual, valorMeta, percentual, legenda }: ProgressCardProps) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
        {titulo}
      </Text>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
        {formatarMoeda(valorAtual)} de {formatarMoeda(valorMeta)}
      </Text>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.background,
          marginTop: 10,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${Math.round(percentual * 100)}%`,
            backgroundColor: cor,
            borderRadius: 4,
          }}
        />
      </View>
      {legenda ? (
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
          {legenda}
        </Text>
      ) : null}
    </Card>
  );
}
