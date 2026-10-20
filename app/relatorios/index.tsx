import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { addMonths, format } from 'date-fns';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MonthSelector } from '@/components/MonthSelector';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { GraficoProjecao } from '@/components/GraficoProjecao';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCategoriasStore } from '@/store/categoriasStore';
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

/** "12% a mais" / "8% a menos" / "igual". */
function variacaoTexto(atual: number, anterior: number): string {
  const pct = Math.round((atual / anterior - 1) * 100);
  if (pct === 0) return 'igual';
  return pct > 0 ? `${pct}% a mais` : `${-pct}% a menos`;
}

export default function RelatoriosScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [mesReferencia, setMesReferencia] = useState(() => format(new Date(), 'yyyy-MM'));

  const { categorias, carregar: carregarCategorias } = useCategoriasStore();

  const { dados, contas, carregarTudo } = useDadosFinanceiros();
  const { orcamentos, carregar: carregarOrcamentos } = useOrcamentosStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const [membro, setMembro] = useState<string>(TODOS);
  const [incluirLista, setIncluirLista] = useState(true);
  const [gerando, setGerando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarCategorias();
      carregarTudo();
      carregarOrcamentos();
      carregarMembros();
    }, [carregarCategorias, carregarTudo, carregarOrcamentos, carregarMembros])
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

  function mudarMes(delta: number) {
    setMesReferencia((atual) => format(addMonths(new Date(`${atual}-01`), delta), 'yyyy-MM'));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Relatórios" subtitle="Para onde seu dinheiro está indo" />
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Button
            titulo={`Ver o ano de ${mesReferencia.slice(0, 4)} inteiro`}
            variante="secundaria"
            onPress={() => router.push({ pathname: '/relatorios/anual', params: { ano: mesReferencia.slice(0, 4) } })}
          />
        </View>
        <MonthSelector mesReferencia={mesReferencia} onAnterior={() => mudarMes(-1)} onProximo={() => mudarMes(1)} />

        {relatorio.categorias.length === 0 && relatorio.resumo.receitas === 0 ? (
          <EmptyState
            icon="bar-chart-2"
            titulo="Nada neste mês"
            descricao="Lance gastos e entradas (ou importe o extrato) para ver o relatório do mês."
          />
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <Card>
              {(
                [
                  ['Receitas', relatorio.resumo.receitas, relatorio.anterior.receitas, colors.success],
                  ['Despesas', relatorio.resumo.despesas, relatorio.anterior.despesas, colors.danger],
                ] as const
              ).map(([rotulo, valor, antes, cor]) => (
                <View key={rotulo} style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 }}>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>
                    {rotulo}
                    {antes > 0 && (
                      <Text style={{ fontSize: 11 }}>{` · ${variacaoTexto(valor, antes)} que o mês anterior`}</Text>
                    )}
                  </Text>
                  <Text className="font-heading-medium" style={{ color: cor, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                    {formatarMoeda(valor)}
                  </Text>
                </View>
              ))}
              {relatorio.resumo.guardado !== 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 }}>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>
                    Guardado
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                    {formatarMoeda(relatorio.resumo.guardado)}
                  </Text>
                </View>
              )}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                  Sobrou
                </Text>
                <Text
                  className="font-heading"
                  style={{ color: relatorio.resumo.sobra >= 0 ? colors.text : colors.danger, fontSize: 18, fontVariant: ['tabular-nums'] }}
                >
                  {formatarMoeda(relatorio.resumo.sobra)}
                </Text>
              </View>
            </Card>

            {relatorio.categorias.length > 0 && (
              <Card>
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
                  Para onde foi o dinheiro
                </Text>
                {relatorio.categorias.map((c) => {
                  const maior = Math.max(1, ...relatorio.categorias.map((x) => Math.max(x.total, x.orcamento ?? 0)));
                  const parte = relatorio.resumo.despesas > 0 ? Math.round((c.total / relatorio.resumo.despesas) * 100) : 0;
                  return (
                    <View key={c.nome} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                          {c.nome} · {parte}%
                        </Text>
                        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                          {formatarMoeda(c.total)}
                        </Text>
                      </View>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 4, overflow: 'hidden' }}>
                        <View style={{ height: 6, width: `${Math.max(2, Math.round((c.total / maior) * 100))}%`, backgroundColor: c.cor }} />
                      </View>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                        {c.media > 0 ? `Média de 3 meses: ${formatarMoeda(c.media)}` : 'Sem média dos meses anteriores'}
                        {c.orcamento !== null ? ` · orçamento ${formatarMoeda(c.orcamento)}` : ''}
                      </Text>
                    </View>
                  );
                })}
              </Card>
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: 20, gap: 12, marginTop: 12 }}>
          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
              Últimos 6 meses
            </Text>
            <GraficoProjecao
              projecao={relatorio.ultimosMeses.map((m) => ({
                mes: m.mes,
                receitaPrevista: m.receitas,
                despesaPrevista: m.despesas,
                saldoPrevisto: m.receitas - m.despesas,
              }))}
              mesAtual={mesReferencia}
              rotuloDaLinha="Sobra do mês"
            />
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
