import React, { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { SwitchRow } from '@/components/SwitchRow';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { lerDivisao, type DivisaoDoSalario } from '@/domain/usecases/automacoes/divisaoSalario';

const PERCENTUAIS = [0, 5, 10, 15, 20, 30];

/** Quanto do salário o app sugere separar para a reserva e para os cofrinhos. */
export default function DivisaoDoSalarioScreen() {
  const { colors } = useAppTheme();
  const { preferencias, carregar, atualizar } = usePreferenciasStore();

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  const divisao = lerDivisao(preferencias?.divisaoSalario ?? null);
  const mudar = (parcial: Partial<DivisaoDoSalario>) => atualizar({ divisaoSalario: JSON.stringify({ ...divisao, ...parcial }) });
  const opcoes = PERCENTUAIS.map((p) => ({ valor: String(p), rotulo: `${p}%` }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Divisão do salário" subtitle="Guardar uma parte assim que o salário entra" />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <SwitchRow
            titulo="Sugerir quando o salário entrar"
            descricao="Aparece no Início por 7 dias. Nada é guardado sem você tocar em Guardar."
            valor={divisao.ativo}
            onAlterar={(ativo) => mudar({ ativo })}
          />
          {divisao.ativo && (
            <Card>
              <ChipSelect
                label="Para a reserva de emergência (enquanto não chega na meta)"
                opcoes={opcoes}
                valor={String(divisao.reservaPct)}
                onSelecionar={(v) => mudar({ reservaPct: Number(v) })}
              />
              <ChipSelect
                label="Para os cofrinhos (dividido pelo que falta em cada um)"
                opcoes={opcoes}
                valor={String(divisao.cofrinhosPct)}
                onSelecionar={(v) => mudar({ cofrinhosPct: Number(v) })}
              />
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                A sugestão nunca deixa o Livre para gastar negativo: se o mês estiver apertado, ela diminui sozinha.
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
