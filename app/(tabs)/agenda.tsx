import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MonthSelector } from '@/components/MonthSelector';
import { Card } from '@/components/Card';
import { Calendario, type MarcaDoDia } from '@/components/agenda/Calendario';
import { PainelDePagamentos } from '@/components/agenda/PainelDePagamentos';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, hojeIso, mesAnterior, mesAtualIso, mesSeguinte } from '@/core/utils/date';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { calcularPagamentosDoMes } from '@/domain/usecases/calcularPagamentosDoMes';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { calcularSaldoTotal } from '@/domain/usecases/calcularSaldoConta';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import { menorSaldoPrevisto } from '@/domain/usecases/automacoes/saldoProjetado';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

/** Compromissos e entradas que aparecem no calendário (compras no cartão entram pela fatura). */
function entraNaAgenda(l: LancamentoDoPeriodo): boolean {
  if (l.tipo === 'fatura') return l.valor > 0;
  if (l.tipo === 'conta_fixa') return !l.noCartao;
  return l.natureza === 'receita';
}

function marcaDe(l: LancamentoDoPeriodo): MarcaDoDia {
  if (l.natureza === 'receita') return 'entrada';
  return l.status;
}

/**
 * Agenda: o calendário do mês com tudo o que vence (contas fixas, faturas) e as entradas,
 * a lista do dia escolhido e, embaixo, a tela de Pagamentos inteira (o que pagar, o que já
 * foi pago, marcar como paga, ajustar valor e pagar fatura).
 */
export default function AgendaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, contas, carregarTudo } = useDadosFinanceiros();
  const hoje = hojeIso();

  // vindo de uma notificação: /agenda?mes=2026-10&item=parcela-12 (ou fatura-3)
  const params = useLocalSearchParams<{ mes?: string; item?: string }>();
  const [mes, setMes] = useState(mesAtualIso());
  const [destaque, setDestaque] = useState<string | null>(null);
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(hoje);
  const [paramsLidos, setParamsLidos] = useState<string | null>(null);
  const chaveDosParams = `${params.mes ?? ''}|${params.item ?? ''}`;
  if (chaveDosParams !== paramsLidos) {
    setParamsLidos(chaveDosParams);
    if (params.mes && /^\d{4}-\d{2}$/.test(params.mes)) setMes(params.mes);
    setDestaque(params.item ?? null);
  }

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
    }, [carregarTudo])
  );

  const pagamentos = useMemo(
    () =>
      calcularPagamentosDoMes(
        dados.contasFixas ?? [],
        dados.parcelas ?? [],
        dados.comprasParceladas ?? [],
        dados.cartoes ?? [],
        dados.gastos ?? [],
        dados.faturas ?? [],
        mes
      ),
    [dados, mes]
  );

  const doMes = useMemo(
    () => obterLancamentosDoPeriodo(`${mes}-01`, dataNoMes(mes, 31), dados, hoje).filter(entraNaAgenda),
    [dados, mes, hoje]
  );
  const marcas = useMemo(() => {
    const mapa = new Map<string, MarcaDoDia[]>();
    for (const l of doMes) mapa.set(l.data, [...(mapa.get(l.data) ?? []), marcaDe(l)]);
    return mapa;
  }, [doMes]);
  const doDia = diaEscolhido ? doMes.filter((l) => l.data === diaEscolhido) : [];

  const menor = useMemo(() => {
    if (mes < mesAtualIso()) return null;
    const lancamentos = obterLancamentosDoPeriodo(`${mesAnterior(mesAtualIso())}-01`, dataNoMes(mes, 31), dados, hoje);
    return menorSaldoPrevisto({
      saldoHoje: calcularSaldoTotal(contas, dados.movimentacoes ?? [], dados.gastos ?? []),
      lancamentos,
      hoje,
      ate: dataNoMes(mes, 31),
    });
  }, [mes, dados, hoje, contas]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Agenda" subtitle="O que vence e o que já foi pago" />
        <MonthSelector
          mesReferencia={mes}
          onAnterior={() => {
            setMes(mesAnterior(mes));
            setDiaEscolhido(null);
          }}
          onProximo={() => {
            setMes(mesSeguinte(mes));
            setDiaEscolhido(null);
          }}
        />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
              Pago {formatarMoeda(pagamentos.totalPago)} · Falta {formatarMoeda(pagamentos.totalPendente)}
            </Text>
            {menor && (
              <Text className="font-body" style={{ color: menor.valor < 0 ? colors.danger : colors.textMuted, fontSize: 12, marginTop: 4 }}>
                Menor saldo previsto: {formatarMoeda(menor.valor)} em {formatarData(menor.data, 'dd/MM')}
              </Text>
            )}
            <View style={{ marginTop: 12 }}>
              <Calendario mes={mes} hoje={hoje} selecionado={diaEscolhido} marcas={marcas} onSelecionar={setDiaEscolhido} />
            </View>
          </Card>

          {diaEscolhido && (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 14, marginBottom: 6 }}>
                {formatarData(diaEscolhido, "EEEE, d 'de' MMMM").replace(/^./, (c) => c.toUpperCase())}
              </Text>
              {doDia.length === 0 ? (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                  Nada vence neste dia.
                </Text>
              ) : (
                doDia.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => (l.tipo === 'conta_fixa' || l.tipo === 'fatura' ? setDestaque(l.tipo === 'fatura' ? `fatura-${l.cartaoId}` : l.id) : router.push(l.link as Href))}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                        {l.descricao}
                      </Text>
                      <Text
                        className="font-body"
                        style={{
                          color: l.status === 'atrasado' ? colors.danger : l.status === 'pago' ? colors.success : colors.textMuted,
                          fontSize: 11,
                        }}
                      >
                        {l.natureza === 'receita' ? 'Entrada' : l.status === 'pago' ? 'Pago' : l.status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                      </Text>
                    </View>
                    <Text
                      className="font-heading-medium"
                      style={{ color: l.natureza === 'receita' ? colors.success : colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}
                    >
                      {l.natureza === 'receita' ? '+' : ''}
                      {formatarMoeda(l.valor)}
                    </Text>
                  </Pressable>
                ))
              )}
            </Card>
          )}

          <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 17, marginTop: 8 }}>
            Pagamentos do mês
          </Text>
          <PainelDePagamentos
            mes={mes}
            pagamentos={pagamentos}
            contas={contas}
            destaque={destaque}
            onLimparDestaque={() => setDestaque(null)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
