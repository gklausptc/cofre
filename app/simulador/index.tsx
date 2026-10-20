import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia, hojeIso } from '@/core/utils/date';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { projetarFluxoCaixa } from '@/domain/usecases/projetarFluxoCaixa';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';
import { simularCompra } from '@/domain/usecases/automacoes/simuladores';

const A_VISTA = 'avista';
const PARCELAS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

/** "Dá para comprar?": o impacto de uma compra na sobra dos próximos meses. */
export default function SimuladorScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, carregarTudo } = useDadosFinanceiros();
  const [valor, setValor] = useState(0);
  const [parcelas, setParcelas] = useState(1);
  const [meio, setMeio] = useState<string>(A_VISTA);

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
    }, [carregarTudo])
  );

  const cartoes = useMemo(() => (dados.cartoes ?? []).filter((c) => c.ativo !== false), [dados.cartoes]);
  const cartao = meio === A_VISTA ? null : (cartoes.find((c) => String(c.id) === meio) ?? null);
  const projecao = useMemo(
    () =>
      projetarFluxoCaixa(
        14,
        dados.parcelas ?? [],
        dados.movimentacoes ?? [],
        dados.gastos ?? [],
        dados.contasFixas ?? [],
        dados.comprasParceladas ?? [],
        dados.cartoes ?? []
      ),
    [dados]
  );
  const limite = cartao
    ? calcularLimiteDisponivel(cartao, dados.comprasParceladas ?? [], dados.parcelas ?? [], dados.gastos ?? [], dados.faturas ?? [])
    : null;
  const simulacao = valor > 0 ? simularCompra({ valor, parcelas: cartao ? parcelas : 1, cartao, limiteDisponivel: limite, dataCompra: hojeIso(), projecao }) : null;
  const corDoVeredito =
    simulacao?.veredito === 'da' ? colors.success : simulacao?.veredito === 'apertado' ? colors.warning : colors.danger;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Dá para comprar?" subtitle="O efeito da compra nos próximos meses" />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Card>
            <CurrencyInput label="Valor da compra" valor={valor} onChangeValor={setValor} />
            <ChipSelect
              label="Como pagar"
              opcoes={[{ valor: A_VISTA, rotulo: 'À vista (débito/pix)' }, ...cartoes.map((c) => ({ valor: String(c.id), rotulo: c.nome }))]}
              valor={meio}
              onSelecionar={setMeio}
            />
            {cartao && (
              <ChipSelect
                label="Parcelas"
                opcoes={PARCELAS.map((n) => ({ valor: String(n), rotulo: n === 1 ? 'À vista' : `${n}x` }))}
                valor={String(parcelas)}
                onSelecionar={(v) => setParcelas(Number(v))}
              />
            )}
          </Card>

          {simulacao && (
            <Card style={{ borderColor: corDoVeredito }}>
              <Text className="font-heading-medium" style={{ color: corDoVeredito, fontSize: 18 }}>
                {simulacao.titulo}
              </Text>
              <Text className="font-body" style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>
                {simulacao.detalhe}
              </Text>
              {simulacao.alternativa !== null && (
                <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, marginTop: 8 }}>
                  Em {simulacao.alternativa}x cabe sem apertar.
                </Text>
              )}
              {simulacao.veredito === 'sem_renda' && (
                <View style={{ marginTop: 12 }}>
                  <Button titulo="Lançar uma entrada" variante="secundaria" onPress={() => router.push('/movimentacao/novo')} />
                </View>
              )}
              {simulacao.veredito !== 'sem_renda' && (
                <View style={{ marginTop: 12 }}>
                  {simulacao.meses
                    .filter((m) => m.parcela > 0)
                    .map((m) => (
                      <View
                        key={m.mes}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}
                      >
                        <Text className="font-body" style={{ color: colors.text, fontSize: 13, textTransform: 'capitalize' }}>
                          {formatarMesReferencia(m.mes)}
                        </Text>
                        <Text
                          className="font-heading-medium"
                          style={{ color: m.sobraDepois < 0 ? colors.danger : colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}
                        >
                          sobra {formatarMoeda(m.sobraDepois)}
                        </Text>
                      </View>
                    ))}
                </View>
              )}
            </Card>
          )}

          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
            A sobra de cada mês é a receita prevista menos contas fixas, parcelas e compras no cartão já lançadas. Gastos
            do dia a dia que ainda não aconteceram não entram.
          </Text>
          <Button titulo="Adiantar parcelas" variante="secundaria" onPress={() => router.push('/simulador/quitacao')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
