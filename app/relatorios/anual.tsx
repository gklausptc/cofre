import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { EmptyState } from '@/components/EmptyState';
import { GraficoProjecao } from '@/components/GraficoProjecao';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarDataHora, formatarMesReferencia, hojeIso } from '@/core/utils/date';
import { gerarECompartilharPdf } from '@/core/relatorios/pdf';
import { NOME_DO_APP } from '@/core/marca';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { montarRelatorioAnual, relatorioAnualEmHtml, nomeCurtoDoMes } from '@/domain/usecases/automacoes/relatorioAnual';

const TODOS = 'todos';

function Linha({ rotulo, valor, cor, nota }: { rotulo: string; valor: number; cor?: string; nota?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 }}>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>
        {rotulo}
        {nota ? <Text style={{ fontSize: 11 }}>{` · ${nota}`}</Text> : null}
      </Text>
      <Text className="font-heading-medium" style={{ color: cor ?? colors.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {formatarMoeda(valor)}
      </Text>
    </View>
  );
}

/** O ano inteiro numa tela: receitas × despesas mês a mês, categorias, maiores gastos, contas. */
export default function RelatorioAnualScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ ano?: string }>();
  const [ano, setAno] = useState(() => {
    const doParametro = Number(params.ano);
    return Number.isInteger(doParametro) && doParametro > 2000 ? doParametro : new Date().getFullYear();
  });
  const { dados, contas, categorias, carregarTudo } = useDadosFinanceiros();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const [membro, setMembro] = useState<string>(TODOS);
  const [gerando, setGerando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
      carregarMembros();
    }, [carregarTudo, carregarMembros])
  );

  const relatorio = useMemo(() => {
    const lancamentos = obterLancamentosDoPeriodo(`${ano - 1}-01-01`, `${ano}-12-31`, dados, hojeIso());
    const saldoAte = (conta: (typeof contas)[number], ate: string) =>
      calcularSaldoConta(
        conta,
        (dados.movimentacoes ?? []).filter((m) => m.data <= ate),
        (dados.gastos ?? []).filter((g) => g.data <= ate)
      );
    return montarRelatorioAnual({
      ano,
      lancamentos,
      categorias,
      cartoes: dados.cartoes ?? [],
      membros,
      membroId: membro === TODOS ? null : Number(membro),
      contas: contas
        .filter((c) => c.ativo !== false)
        .map((c) => ({ nome: c.nomeConta, inicio: saldoAte(c, `${ano - 1}-12-31`), fim: saldoAte(c, `${ano}-12-31`) })),
    });
  }, [ano, dados, categorias, membros, membro, contas]);

  const anoAtual = new Date().getFullYear();
  const projecao = relatorio.meses.map((m, i) => ({
    mes: m.mes,
    receitaPrevista: m.receitas,
    despesaPrevista: m.despesas,
    saldoPrevisto: relatorio.meses.slice(0, i + 1).reduce((s, x) => s + x.sobra, 0),
  }));
  const maiorCategoria = Math.max(1, ...relatorio.despesasPorCategoria.map((c) => c.total));

  async function exportarPdf() {
    setGerando(true);
    try {
      await gerarECompartilharPdf(
        relatorioAnualEmHtml(relatorio, `${NOME_DO_APP} · Relatório de ${ano}`, formatarDataHora(new Date().toISOString())),
        `Relatorio-${ano}.pdf`
      );
    } catch (erro) {
      Alert.alert('Não consegui gerar o PDF', erro instanceof Error ? erro.message : 'Tente de novo.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <ScreenHeader title={`Relatório de ${ano}`} subtitle={ano === anoAtual ? 'Até hoje, pelo que já aconteceu' : 'O ano inteiro'} />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Pressable onPress={() => setAno(ano - 1)} accessibilityRole="button" accessibilityLabel="Ano anterior" hitSlop={10} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="chevron-left" size={22} color={colors.brand} />
          </Pressable>
          <Text className="font-heading" style={{ color: colors.text, fontSize: 20 }}>
            {ano}
          </Text>
          <Pressable
            onPress={() => setAno(ano + 1)}
            disabled={ano >= anoAtual}
            accessibilityRole="button"
            accessibilityLabel="Próximo ano"
            hitSlop={10}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', opacity: ano >= anoAtual ? 0.3 : 1 }}
          >
            <Feather name="chevron-right" size={22} color={colors.brand} />
          </Pressable>
        </View>

        {membros.length > 1 && (
          <ChipSelect
            label="De quem"
            opcoes={[{ valor: TODOS, rotulo: 'Todos' }, ...membros.map((m) => ({ valor: String(m.id), rotulo: m.nome }))]}
            valor={membro}
            onSelecionar={setMembro}
          />
        )}

        {relatorio.mesesComDados === 0 ? (
          <EmptyState
            icon="bar-chart-2"
            titulo={`Nada em ${ano}`}
            descricao="Importe os extratos do ano (vários de uma vez, pelo +) para ver o relatório completo."
          />
        ) : (
          <>
            <Card>
              <Linha rotulo="Receitas" valor={relatorio.total.receitas} cor={colors.success} />
              <Linha rotulo="Despesas" valor={relatorio.total.despesas} cor={colors.danger} />
              {relatorio.total.guardado !== 0 && <Linha rotulo="Guardado" valor={relatorio.total.guardado} />}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />
              <Linha rotulo="Sobrou" valor={relatorio.total.sobra} cor={relatorio.total.sobra >= 0 ? colors.text : colors.danger} />
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                {relatorio.taxaDePoupanca !== null
                  ? relatorio.taxaDePoupanca >= 0
                    ? `${Math.round(relatorio.taxaDePoupanca * 100)}% do que entrou não foi gasto.`
                    : `Você gastou ${Math.round(-relatorio.taxaDePoupanca * 100)}% a mais do que entrou.`
                  : 'Nenhuma receita registrada no ano.'}{' '}
                Média por mês: {formatarMoeda(relatorio.mediaMensal.receitas)} de receita e {formatarMoeda(relatorio.mediaMensal.despesas)} de
                despesa ({relatorio.mesesComDados} {relatorio.mesesComDados === 1 ? 'mês' : 'meses'} com lançamentos).
              </Text>
              {relatorio.anoAnterior && relatorio.anoAnterior.despesas > 0 && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  Em {ano - 1}: {formatarMoeda(relatorio.anoAnterior.receitas)} de receita e {formatarMoeda(relatorio.anoAnterior.despesas)} de despesa.
                </Text>
              )}
            </Card>

            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                Mês a mês
              </Text>
              <GraficoProjecao projecao={projecao} mesAtual={ano === anoAtual ? hojeIso().slice(0, 7) : `${ano}-12`} rotuloDaLinha="Sobra acumulada" />
              <View style={{ marginTop: 10 }}>
                {relatorio.meses
                  .filter((m) => m.temDados)
                  .map((m) => (
                    <View key={m.mes} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 12, width: 40 }}>
                        {nomeCurtoDoMes(m.mes)}
                      </Text>
                      <Text className="font-body" style={{ color: colors.success, fontSize: 12, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                        {formatarMoeda(m.receitas)}
                      </Text>
                      <Text className="font-body" style={{ color: colors.danger, fontSize: 12, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                        {formatarMoeda(m.despesas)}
                      </Text>
                      <Text
                        className="font-body-medium"
                        style={{ color: m.sobra >= 0 ? colors.text : colors.danger, fontSize: 12, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}
                      >
                        {formatarMoeda(m.sobra)}
                      </Text>
                    </View>
                  ))}
              </View>
              {relatorio.melhorMes && relatorio.piorMes && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                  Melhor mês: {formatarMesReferencia(relatorio.melhorMes.mes)} (sobrou {formatarMoeda(relatorio.melhorMes.sobra)}). Mais
                  apertado: {formatarMesReferencia(relatorio.piorMes.mes)} ({formatarMoeda(relatorio.piorMes.sobra)}).
                </Text>
              )}
            </Card>

            {relatorio.despesasPorCategoria.length > 0 && (
              <Card>
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                  Para onde foi o dinheiro
                </Text>
                {relatorio.despesasPorCategoria.slice(0, 12).map((c) => (
                  <View key={String(c.categoriaId)} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
                        {c.nome} · {Math.round(c.percentual * 100)}%
                      </Text>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                        {formatarMoeda(c.total)}
                      </Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 4, overflow: 'hidden' }}>
                      <View style={{ height: 6, width: `${Math.max(2, Math.round((c.total / maiorCategoria) * 100))}%`, backgroundColor: c.cor }} />
                    </View>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      Média de {formatarMoeda(c.mediaMensal)} por mês
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            {relatorio.receitasPorCategoria.length > 0 && (
              <Card>
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
                  De onde veio
                </Text>
                {relatorio.receitasPorCategoria.map((c) => (
                  <Linha key={String(c.categoriaId)} rotulo={c.nome} valor={c.total} nota={`${Math.round(c.percentual * 100)}%`} />
                ))}
              </Card>
            )}

            {relatorio.maioresGastos.length > 0 && (
              <Card>
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
                  Maiores gastos
                </Text>
                {relatorio.maioresGastos.map((g, i) => (
                  <View key={`${g.data}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                        {g.descricao}
                      </Text>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                        {formatarData(g.data)} · {g.categoria}
                      </Text>
                    </View>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {formatarMoeda(g.valor)}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            {(relatorio.cartoes.length > 0 || relatorio.membros.length > 0) && (
              <Card>
                {relatorio.cartoes.length > 0 && (
                  <>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
                      No cartão
                    </Text>
                    {relatorio.cartoes.map((c) => (
                      <Linha key={c.nome} rotulo={c.nome} valor={c.total} />
                    ))}
                  </>
                )}
                {relatorio.membros.length > 0 && (
                  <>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4, marginTop: relatorio.cartoes.length > 0 ? 10 : 0 }}>
                      Por membro
                    </Text>
                    {relatorio.membros.map((m) => (
                      <Linha key={m.nome} rotulo={m.nome} valor={m.total} />
                    ))}
                  </>
                )}
              </Card>
            )}

            {relatorio.contas.length > 0 && (
              <Card>
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
                  Saldo das contas
                </Text>
                {relatorio.contas.map((c) => (
                  <View key={c.nome} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
                      {c.nome}
                    </Text>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                      {formatarMoeda(c.inicio)} → {' '}
                    </Text>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {formatarMoeda(c.fim)}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            <Button titulo={`Gerar PDF de ${ano}`} onPress={exportarPdf} carregando={gerando} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
