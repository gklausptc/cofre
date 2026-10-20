import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { PieChart } from 'react-native-gifted-charts';
import { addMonths, format } from 'date-fns';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MonthSelector } from '@/components/MonthSelector';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { calcularGastosPorCategoria } from '@/domain/usecases/calcularGastosPorCategoria';
import { calcularResumoMensal } from '@/domain/usecases/calcularResumoMensal';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia, hojeIso, mesAnterior } from '@/core/utils/date';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { SwitchRow } from '@/components/SwitchRow';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { useOrcamentosStore } from '@/store/orcamentosStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { projetarFluxoCaixa } from '@/domain/usecases/projetarFluxoCaixa';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import { montarRelatorio, relatorioEmHtml } from '@/domain/usecases/automacoes/relatorio';
import { gerarECompartilharPdf } from '@/core/relatorios/pdf';
import { NOME_DO_APP } from '@/core/marca';

const TODOS = 'todos';

export default function RelatoriosScreen() {
  const { colors } = useAppTheme();
  const [mesReferencia, setMesReferencia] = useState(() => format(new Date(), 'yyyy-MM'));

  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();

  const { dados, contas, carregarTudo } = useDadosFinanceiros();
  const { orcamentos, carregar: carregarOrcamentos } = useOrcamentosStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const [membro, setMembro] = useState<string>(TODOS);
  const [incluirLista, setIncluirLista] = useState(true);
  const [gerando, setGerando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarMovimentacoes();
      carregarGastos();
      carregarParcelas();
      carregarCategorias();
      carregarTudo();
      carregarOrcamentos();
      carregarMembros();
    }, [carregarMovimentacoes, carregarGastos, carregarCategorias, carregarParcelas, carregarTudo, carregarOrcamentos, carregarMembros])
  );

  const relatorio = useMemo(() => {
    const inicio = `${format(addMonths(new Date(`${mesReferencia}-01T12:00:00`), -6), 'yyyy-MM')}-01`;
    const lancamentos = obterLancamentosDoPeriodo(inicio, dataNoMes(mesReferencia, 31), dados, hojeIso());
    const fimDoMesAnterior = dataNoMes(mesAnterior(mesReferencia), 31);
    const fimDoMes = dataNoMes(mesReferencia, 31);
    const saldoAte = (conta: (typeof contas)[number], ate: string) =>
      calcularSaldoConta(
        conta,
        (dados.movimentacoes ?? []).filter((m) => m.data <= ate),
        (dados.gastos ?? []).filter((g) => g.data <= ate)
      );
    return montarRelatorio({
      mes: mesReferencia,
      lancamentos,
      categorias,
      orcamentos,
      membros,
      membroId: membro === TODOS ? null : Number(membro),
      contas: contas
        .filter((c) => c.ativo !== false)
        .map((c) => ({ nome: c.nomeConta, inicio: saldoAte(c, fimDoMesAnterior), fim: saldoAte(c, fimDoMes) })),
      projecao: projetarFluxoCaixa(
        12,
        dados.parcelas ?? [],
        dados.movimentacoes ?? [],
        dados.gastos ?? [],
        dados.contasFixas ?? [],
        dados.comprasParceladas ?? [],
        dados.cartoes ?? []
      ),
      incluirLancamentos: incluirLista,
      agora: new Date(),
      nomeDoApp: NOME_DO_APP,
    });
  }, [mesReferencia, dados, categorias, orcamentos, membros, membro, contas, incluirLista]);

  async function exportarPdf() {
    setGerando(true);
    try {
      await gerarECompartilharPdf(relatorioEmHtml(relatorio), `Relatorio-${mesReferencia}.pdf`);
    } catch (erro) {
      Alert.alert('Não consegui gerar o PDF', erro instanceof Error ? erro.message : 'Tente de novo.');
    } finally {
      setGerando(false);
    }
  }

  const gastosPorCategoria = useMemo(
    () => calcularGastosPorCategoria(movimentacoes, gastos, categorias, mesReferencia),
    [movimentacoes, gastos, categorias, mesReferencia]
  );
  const resumo = useMemo(
    () => calcularResumoMensal(movimentacoes, gastos, mesReferencia, parcelas),
    [movimentacoes, gastos, mesReferencia, parcelas]
  );

  const dadosGrafico = gastosPorCategoria.map((item) => ({
    value: item.total,
    color: item.cor,
    text: '',
  }));

  function mudarMes(delta: number) {
    setMesReferencia((atual) => format(addMonths(new Date(`${atual}-01`), delta), 'yyyy-MM'));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Relatórios" subtitle="Para onde seu dinheiro está indo" />
        <MonthSelector mesReferencia={mesReferencia} onAnterior={() => mudarMes(-1)} onProximo={() => mudarMes(1)} />

        {gastosPorCategoria.length === 0 ? (
          <EmptyState
            icon="pie-chart"
            titulo="Sem gastos neste mês"
            descricao="Lance movimentações ou gastos rápidos para ver o relatório por categoria."
          />
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <Card style={{ alignItems: 'center' }}>
              <PieChart
                data={dadosGrafico}
                radius={90}
                donut
                innerRadius={56}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                      Total gasto
                    </Text>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                      {formatarMoeda(resumo.despesas)}
                    </Text>
                  </View>
                )}
              />
            </Card>

            <View style={{ height: 16 }} />

            <Card style={{ paddingVertical: 4 }}>
              {gastosPorCategoria.map((item, index) => (
                <View
                  key={item.categoriaId ?? 'sem-categoria'}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View
                    style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.cor, marginRight: 10 }}
                  />
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                    {item.nome}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginRight: 8 }}>
                    {resumo.despesas > 0 ? Math.round((item.total / resumo.despesas) * 100) : 0}%
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                    {formatarMoeda(item.total)}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        <View style={{ paddingHorizontal: 20, gap: 12, marginTop: 16 }}>
          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
              Últimos 6 meses
            </Text>
            {relatorio.ultimosMeses.map((m) => (
              <View key={m.mes} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text className="font-body" style={{ color: colors.text, fontSize: 13, textTransform: 'capitalize' }}>
                  {formatarMesReferencia(m.mes).split(' ')[0]}
                </Text>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                  {`entrou ${formatarMoeda(m.receitas)} · saiu ${formatarMoeda(m.despesas)}`}
                </Text>
              </View>
            ))}
          </Card>

          {relatorio.contas.length > 0 && (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                Por conta
              </Text>
              {relatorio.contas.map((c) => (
                <View key={c.nome} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text className="font-body" style={{ color: colors.text, fontSize: 13 }}>
                    {c.nome}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                    {`${formatarMoeda(c.inicio)} → ${formatarMoeda(c.fim)}`}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {relatorio.cartoes.length > 0 && (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                Por cartão
              </Text>
              {relatorio.cartoes.map((c) => (
                <View key={c.nome} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text className="font-body" style={{ color: colors.text, fontSize: 13 }}>
                    {`${c.nome} · ${c.paga ? 'paga' : 'em aberto'}`}
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                    {formatarMoeda(c.valor)}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {relatorio.membros.length > 0 && (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                Por membro
              </Text>
              {relatorio.membros.map((m) => (
                <View key={m.nome} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text className="font-body" style={{ color: colors.text, fontSize: 13 }}>
                    {m.nome}
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                    {formatarMoeda(m.total)}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
              Relatório em PDF
            </Text>
            {membros.length > 0 && (
              <ChipSelect
                label="De quem"
                opcoes={[{ valor: TODOS, rotulo: 'Todos' }, ...membros.map((m) => ({ valor: String(m.id), rotulo: m.nome }))]}
                valor={membro}
                onSelecionar={setMembro}
              />
            )}
            <SwitchRow titulo="Incluir lista de lançamentos" valor={incluirLista} onAlterar={setIncluirLista} />
            <Button titulo={`Gerar PDF de ${formatarMesReferencia(mesReferencia)}`} onPress={exportarPdf} carregando={gerando} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
