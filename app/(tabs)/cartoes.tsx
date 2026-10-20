import React, { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCartoesStore } from '@/store/cartoesStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useFaturasStore } from '@/store/faturasStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';
import { calcularPagamentosDoMes } from '@/domain/usecases/calcularPagamentosDoMes';
import { dataFechamentoDaFatura, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import { descreverCartaoParaHoje, melhorCartaoParaHoje } from '@/domain/usecases/automacoes/simuladores';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia, hojeIso } from '@/core/utils/date';

export default function CartoesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { faturas, carregar: carregarFaturas } = useFaturasStore();
  const { contas: contasFixas, carregar: carregarContasFixas } = useContasFixasStore();
  const hoje = hojeIso();

  useFocusEffect(
    useCallback(() => {
      carregarCartoes();
      carregarCompras();
      carregarParcelas();
      carregarGastos();
      carregarFaturas();
      carregarContasFixas();
    }, [carregarCartoes, carregarCompras, carregarParcelas, carregarGastos, carregarFaturas, carregarContasFixas])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Cartões" subtitle="Limite disponível e parcelas em aberto" />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {(() => {
            const limites = new Map(cartoes.map((c) => [c.id, calcularLimiteDisponivel(c, compras, parcelas, gastos, faturas)]));
            const ranking = melhorCartaoParaHoje(cartoes, hoje, limites);
            if (ranking.length < 2) return null;
            return (
              <Card>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                  Melhor cartão para comprar hoje
                </Text>
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginTop: 2 }}>
                  {descreverCartaoParaHoje(ranking[0])}
                </Text>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  É o que dá mais prazo até pagar uma compra feita hoje.
                </Text>
              </Card>
            );
          })()}
          {cartoes.length === 0 ? (
            <EmptyState
              icon="credit-card"
              titulo="Nenhum cartão cadastrado"
              descricao="Cadastre seus cartões de crédito para acompanhar limite disponível e compras parceladas."
            />
          ) : (
            cartoes.map((cartao) => {
              const disponivel = calcularLimiteDisponivel(cartao, compras, parcelas, gastos, faturas);
              // fatura que recebe as compras de hoje: o valor dela até agora é a fatura prevista
              const mesDaFatura = mesDeCobrancaDoGasto({ data: hoje, formaPagamento: 'cartao', cartaoId: cartao.id }, new Map([[cartao.id, cartao]]));
              const grupo = calcularPagamentosDoMes(contasFixas, parcelas, compras, cartoes, gastos, faturas, mesDaFatura).grupos.find(
                (g) => g.cartao?.id === cartao.id
              );
              return (
                <Pressable key={cartao.id} onPress={() => router.push(`/cartao/${cartao.id}`)}>
                  <Card style={{ backgroundColor: cartao.cor, borderWidth: 0 }}>
                    <Text className="font-body-medium" style={{ color: '#FFFFFF', fontSize: 13, opacity: 0.85 }}>
                      {cartao.nome}
                    </Text>
                    <Text className="font-heading" style={{ color: '#FFFFFF', fontSize: 22, marginTop: 4 }}>
                      {formatarMoeda(disponivel)}
                    </Text>
                    <Text className="font-body" style={{ color: '#FFFFFF', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                      disponível de {formatarMoeda(cartao.limite)}
                    </Text>
                    <Text className="font-body-medium" style={{ color: '#FFFFFF', fontSize: 12, marginTop: 10 }}>
                      Fatura de {formatarMesReferencia(mesDaFatura).split(' ')[0]} (prevista): {formatarMoeda(grupo?.total ?? 0)}
                    </Text>
                    <Text className="font-body" style={{ color: '#FFFFFF', fontSize: 11, opacity: 0.75 }}>
                      Fecha {formatarData(dataFechamentoDaFatura(mesDaFatura, cartao), 'dd/MM')} · vence dia {cartao.diaVencimento}
                    </Text>
                  </Card>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Button titulo="Novo cartão" onPress={() => router.push('/cartao/novo')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
