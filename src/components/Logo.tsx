import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type LogoProps = {
  size?: number;
  color?: string;
};

/**
 * Marca "Cofre": um "chip" — corpo arredondado com um pad de contato inset no
 * canto superior esquerdo. Mesma geometria usada em scripts/generate-brand-assets.js.
 */
export function LogoMark({ size = 40, color }: LogoProps) {
  const { colors } = useAppTheme();
  const bodyColor = color ?? colors.brand;
  const bodySize = 62;
  const half = bodySize / 2;
  const x = 50 - half;
  const y = 50 - half;
  const rx = bodySize * 0.2;
  const padSize = bodySize * 0.32;
  const padX = x + bodySize * 0.14;
  const padY = y + bodySize * 0.14;
  const padRx = padSize * 0.28;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={x} y={y} width={bodySize} height={bodySize} rx={rx} fill={bodyColor} />
      <Rect x={padX} y={padY} width={padSize} height={padSize} rx={padRx} fill={colors.accent} />
    </Svg>
  );
}

export function Logo({ size = 32 }: LogoProps) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-2">
      <LogoMark size={size} />
      <Text style={{ color: colors.text, fontSize: size * 0.6 }} className="font-heading">
        Cofre
      </Text>
    </View>
  );
}
