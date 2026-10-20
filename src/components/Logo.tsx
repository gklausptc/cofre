import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { NOME_DO_APP } from '@/core/marca';

type LogoProps = {
  size?: number;
  color?: string;
};

const CLARO = '#F7F9FC';
const CIANO = '#06B6D4';
const AZUL_ESCURO = '#1A3FA8';
/** Azul da marca (fixo: a logo é a mesma no tema claro e no escuro). */
const AZUL = '#2A5CE0';

/**
 * Marca "Cofre Klaus": um "K" claro desenhado como porta de cofre (a haste é a dobradiça,
 * com as presilhas do lado) e o ponto ciano do segredo, num quadrado arredondado azul.
 * Mesma geometria de scripts/marca-klaus.js (viewBox 0 0 1024 1024).
 */
export function LogoMark({ size = 40, color }: LogoProps) {
  const fundo = color ?? AZUL;
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel={NOME_DO_APP}>
      <Rect width={1024} height={1024} rx={228} fill={fundo} />
      <Circle cx={512} cy={512} r={352} fill="none" stroke={AZUL_ESCURO} strokeWidth={44} />
      <Rect x={318} y={300} width={112} height={424} rx={30} fill={CLARO} />
      <Rect x={284} y={356} width={40} height={64} rx={12} fill={CLARO} />
      <Rect x={284} y={604} width={40} height={64} rx={12} fill={CLARO} />
      <Line x1={470} y1={500} x2={686} y2={318} stroke={CLARO} strokeWidth={112} strokeLinecap="round" />
      <Line x1={486} y1={512} x2={700} y2={706} stroke={CLARO} strokeWidth={112} strokeLinecap="round" />
      <Circle cx={452} cy={512} r={62} fill={CIANO} stroke={fundo} strokeWidth={18} />
    </Svg>
  );
}

export function Logo({ size = 32 }: LogoProps) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-2">
      <LogoMark size={size} />
      <Text style={{ color: colors.text, fontSize: size * 0.6 }} className="font-heading">
        {NOME_DO_APP}
      </Text>
    </View>
  );
}
