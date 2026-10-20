import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, hojeIso } from '@/core/utils/date';
import { addDays, format } from 'date-fns';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { detectarAssinaturas } from '@/domain/usecases/automacoes/assinaturas';

/** Tudo o que cobra todo mês na categoria Assinaturas, com o total e os aumentos. */
export default function AssinaturasScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, categorias, carregarTudo } = useDadosFinanceiros();
  const atualizarContaFixa = useContasFixasStore((s) => s.atualizar);

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
    }, [carregarTudo])
  );

  const hoje = hojeIso();
  const resultado = useMemo(() => {
    const inicio = format(addDays(new Date(), -400), 'yyyy-MM-dd');
    const lancamentos = obterLancamentosDoPeriodo(inicio, hoje, dados, hoje);
    return detectarAssinaturas({ lancamentos, contasFixas: dados.contasFixas ?? [], categorias, hoje });
  }, [dados, categorias, hoje]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Assinaturas" subtitle="O que cobra todo mês" />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {resultado.itens.length === 0 ? (
            <EmptyState
              icon="repeat"
              titulo="Nenhuma assinatura"
              descricao="Streaming, música, apps e academia aparecem aqui quando estão na categoria Assinaturas."
            />
          ) : (
            <>
              <Card>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                  Por mês
                </Text>
                <Text className="font-heading" style={{ color: colors.text, fontSize: 26 }}>
                  {formatarMoeda(resultado.totalMensal)}
                </Text>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                  {formatarMoeda(resultado.totalAnual)} por ano · {resultado.itens.length}{' '}
                  {resultado.itens.length === 1 ? 'assinatura' : 'assinaturas'}
                </Text>
              </Card>
              {resultado.itens.map((a) => (
                <Card key={a.chave} style={{ borderColor: a.aumento ? colors.warning : colors.border }}>
                  <Pressable
                    disabled={a.contaFixaId === null}
                    onPress={() => a.contaFixaId !== null && router.push(`/conta-fixa/${a.contaFixaId}`)}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
                        {a.nome}
                      </Text>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                        {a.contaFixaId !== null ? 'Conta fixa' : 'Cobrança que se repete'}
                        {a.ultimaCobranca ? ` · última em ${formatarData(a.ultimaCobranca)}` : ''}
                      </Text>
                    </View>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                      {formatarMoeda(a.valorMensal)}
                    </Text>
                  </Pressable>
                  {a.aumento && (
                    <View style={{ marginTop: 8 }}>
                      <Text className="font-body" style={{ color: colors.warning, fontSize: 12, marginBottom: 8 }}>
                        Subiu de {formatarMoeda(a.aumento.de)} para {formatarMoeda(a.aumento.para)} (+{a.aumento.percentual}%).
                      </Text>
                      {a.contaFixaId !== null && (
                        <Button
                          titulo={`Atualizar conta fixa para ${formatarMoeda(a.aumento.para)}`}
                          variante="secundaria"
                          onPress={() => a.contaFixaId !== null && a.aumento && atualizarContaFixa(a.contaFixaId, { valor: a.aumento.para })}
                        />
                      )}
                    </View>
                  )}
                </Card>
              ))}
            </>
          )}
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
            Para incluir outro item, mude a categoria dele para Assinaturas.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
