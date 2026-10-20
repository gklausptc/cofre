import React, { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarData, mesAtualIso } from '@/core/utils/date';
import { formatarMoeda } from '@/core/utils/currency';
import type { ProjecaoMes } from '@/domain/usecases/projetarFluxoCaixa';

type Props = {
  projecao: ProjecaoMes[];
  /** Mês atual ('YYYY-MM'), em destaque; os seguintes aparecem como previsão. */
  mesAtual?: string;
  altura?: number;
};

const MARGEM = { topo: 12, base: 30, esquerda: 4, direita: 4 };

function Legenda({ cor, rotulo, linha }: { cor: string; rotulo: string; linha?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14 }}>
      <View
        style={{
          width: linha ? 14 : 10,
          height: linha ? 3 : 10,
          borderRadius: linha ? 2 : 3,
          backgroundColor: cor,
          marginRight: 6,
        }}
      />
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
        {rotulo}
      </Text>
    </View>
  );
}

/**
 * Projeção dos próximos meses: barras de receita e despesa prevista por mês e a linha do
 * saldo previsto (que pode ficar negativo). O mês atual fica em destaque; os seguintes,
 * mais claros, são previsão.
 */
export function GraficoProjecao({ projecao, mesAtual = mesAtualIso(), altura = 190 }: Props) {
  const { colors } = useAppTheme();
  const [largura, setLargura] = useState(0);
  const aoMedir = (e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width);

  const valores = projecao.flatMap((p) => [p.receitaPrevista, p.despesaPrevista, p.saldoPrevisto]);
  const maximo = Math.max(1, ...valores);
  const minimo = Math.min(0, ...valores);
  const areaW = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita);
  const areaH = altura - MARGEM.topo - MARGEM.base;
  const y = (v: number) => MARGEM.topo + ((maximo - v) / (maximo - minimo)) * areaH;
  const grupo = projecao.length > 0 ? areaW / projecao.length : 0;
  const barra = Math.min(22, grupo * 0.28);
  const centro = (i: number) => MARGEM.esquerda + grupo * i + grupo / 2;
  const zero = y(0);

  const descricao = projecao
    .map(
      (p) =>
        `${formatarData(`${p.mes}-01`, 'MMMM')}: receita ${formatarMoeda(p.receitaPrevista)}, despesa ${formatarMoeda(
          p.despesaPrevista
        )}, saldo ${formatarMoeda(p.saldoPrevisto)}`
    )
    .join('. ');

  return (
    <View>
      <View onLayout={aoMedir} accessible accessibilityRole="image" accessibilityLabel={`Projeção. ${descricao}`}>
        {largura > 0 && (
          <Svg width={largura} height={altura}>
            <Line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={zero} y2={zero} stroke={colors.border} strokeWidth={1} />
            {projecao.map((p, i) => {
              const futuro = p.mes > mesAtual;
              const opacidade = futuro ? 0.55 : 1;
              const xReceita = centro(i) - barra - 1.5;
              const xDespesa = centro(i) + 1.5;
              const atual = p.mes === mesAtual;
              return (
                <React.Fragment key={p.mes}>
                  {atual && (
                    <Rect
                      x={MARGEM.esquerda + grupo * i + 2}
                      y={MARGEM.topo - 6}
                      width={grupo - 4}
                      height={areaH + 12}
                      rx={8}
                      fill={colors.brand}
                      opacity={0.07}
                    />
                  )}
                  <Rect
                    x={xReceita}
                    y={Math.min(y(p.receitaPrevista), zero)}
                    width={barra}
                    height={Math.abs(zero - y(p.receitaPrevista))}
                    rx={3}
                    fill={colors.success}
                    opacity={opacidade}
                  />
                  <Rect
                    x={xDespesa}
                    y={Math.min(y(p.despesaPrevista), zero)}
                    width={barra}
                    height={Math.abs(zero - y(p.despesaPrevista))}
                    rx={3}
                    fill={colors.danger}
                    opacity={opacidade}
                  />
                  <SvgText
                    x={centro(i)}
                    y={altura - 12}
                    fontSize={11}
                    fontWeight={atual ? '700' : '400'}
                    fill={atual ? colors.text : colors.textMuted}
                    textAnchor="middle"
                  >
                    {formatarData(`${p.mes}-01`, 'MMM')}
                  </SvgText>
                  {futuro && (
                    <SvgText x={centro(i)} y={altura - 1} fontSize={9} fill={colors.textMuted} textAnchor="middle">
                      previsão
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}
            {projecao.length > 1 && (
              <Polyline
                points={projecao.map((p, i) => `${centro(i)},${y(p.saldoPrevisto)}`).join(' ')}
                fill="none"
                stroke={colors.brand}
                strokeWidth={2.5}
              />
            )}
            {projecao.map((p, i) => (
              <Circle
                key={`ponto-${p.mes}`}
                cx={centro(i)}
                cy={y(p.saldoPrevisto)}
                r={4}
                fill={p.saldoPrevisto < 0 ? colors.danger : colors.brand}
                stroke={colors.card}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        <Legenda cor={colors.success} rotulo="Receita" />
        <Legenda cor={colors.danger} rotulo="Despesa" />
        <Legenda cor={colors.brand} rotulo="Saldo previsto" linha />
      </View>
    </View>
  );
}
