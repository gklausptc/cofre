import React, { useCallback, useMemo } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { GraficoProjecao } from '@/components/GraficoProjecao';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia } from '@/core/utils/date';
import { useImportacoesStore } from '@/store/importacoesStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { usePerguntasStore, dadosDaPergunta } from '@/store/perguntasStore';
import { useFaturasStore } from '@/store/faturasStore';
import { resumirImportacao, importacoesQueDependem } from '@/domain/usecases/importacao/resultadoDaImportacao';
import { projetarFluxoCaixa } from '@/domain/usecases/projetarFluxoCaixa';

function Linha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
        {rotulo}
      </Text>
      <Text className="font-heading-medium" style={{ color: cor ?? colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
        {valor}
      </Text>
    </View>
  );
}

/** O que a importação trouxe: entradas e saídas, gastos por categoria, comparação, fora do padrão e a projeção. */
export default function ResultadoDaImportacaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const importacaoId = Number(id);

  const { importacoes, carregar: carregarImportacoes, desfazer } = useImportacoesStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { contas: contasFixas, carregar: carregarContasFixas } = useContasFixasStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { carregar: carregarFaturas } = useFaturasStore();
  const { perguntas, carregar: carregarPerguntas } = usePerguntasStore();

  useFocusEffect(
    useCallback(() => {
      carregarImportacoes();
      carregarMovimentacoes();
      carregarGastos();
      carregarCategorias();
      carregarParcelas();
      carregarContasFixas();
      carregarCompras();
      carregarCartoes();
      carregarPerguntas();
    }, [
      carregarImportacoes,
      carregarMovimentacoes,
      carregarGastos,
      carregarCategorias,
      carregarParcelas,
      carregarContasFixas,
      carregarCompras,
      carregarCartoes,
      carregarPerguntas,
    ])
  );

  const importacao = importacoes.find((i) => i.id === importacaoId) ?? null;
  const resultado = useMemo(
    () => (importacao ? resumirImportacao({ importacao, movimentacoes, gastos, categorias }) : null),
    [importacao, movimentacoes, gastos, categorias]
  );
  const projecao = useMemo(
    () => projetarFluxoCaixa(3, parcelas, movimentacoes, gastos, contasFixas, compras, cartoes),
    [parcelas, movimentacoes, gastos, contasFixas, compras, cartoes]
  );
  const perguntasDesta = perguntas.filter((p) => dadosDaPergunta(p).linhas.some((l) => l.importacaoId === importacaoId) || p.importacaoId === importacaoId);

  function confirmarDesfazer() {
    if (!importacao) return;
    const ids = movimentacoes.filter((m) => m.importacaoId === importacao.id).map((m) => m.id);
    const dependentes = importacoesQueDependem(importacao.id, ids, importacoes.filter((i) => i.criadaEm > importacao.criadaEm));
    if (dependentes.length > 0) {
      Alert.alert(
        'Desfaça antes a mais nova',
        `A importação de "${dependentes[0].arquivo}" usou lançamentos desta (o outro lado de uma transferência). Desfaça ela primeiro.`
      );
      return;
    }
    Alert.alert(
      'Desfazer esta importação?',
      'Os lançamentos dela saem do app e as contas fixas e faturas pagas por ela voltam a ficar pendentes. As regras aprendidas continuam.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desfazer',
          style: 'destructive',
          onPress: async () => {
            await desfazer(importacao.id);
            await Promise.all([carregarMovimentacoes(), carregarGastos(), carregarParcelas(), carregarFaturas(), carregarContasFixas(), carregarCompras(), carregarPerguntas()]);
            router.back();
          },
        },
      ]
    );
  }

  if (!importacao || !resultado) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <EmptyState icon="file" titulo="Importação não encontrada" descricao="Ela pode ter sido desfeita." />
      </SafeAreaView>
    );
  }

  const maior = resultado.porCategoria[0]?.total ?? 0;
  const variacao =
    resultado.comparacao && resultado.comparacao.anterior > 0
      ? Math.round((resultado.comparacao.total / resultado.comparacao.anterior - 1) * 100)
      : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader
          title="Importação concluída"
          subtitle={`${importacao.arquivo}${importacao.periodoInicio && importacao.periodoFim ? ` · ${formatarData(importacao.periodoInicio)} a ${formatarData(importacao.periodoFim)}` : ''}`}
        />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {perguntasDesta.length > 0 && (
            <Card style={{ borderColor: colors.warning }}>
              <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, marginBottom: 8 }}>
                {perguntasDesta.length} {perguntasDesta.length === 1 ? 'pergunta ficou' : 'perguntas ficaram'} para você
              </Text>
              <Button titulo="Responder agora" onPress={() => router.push('/revisao')} />
            </Card>
          )}

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>
              O que entrou
            </Text>
            <Linha rotulo={`${importacao.importadas} ${importacao.importadas === 1 ? 'lançamento' : 'lançamentos'}`} valor="" />
            {resultado.entradas > 0 && <Linha rotulo="Entradas" valor={formatarMoeda(resultado.entradas)} cor={colors.success} />}
            <Linha rotulo="Gastos" valor={formatarMoeda(resultado.saidas)} cor={colors.danger} />
            {resultado.pagamentos > 0 && <Linha rotulo="Pagamentos de fatura e contas fixas" valor={formatarMoeda(resultado.pagamentos)} />}
            {resultado.contasFixasPagas > 0 && (
              <Linha rotulo="Contas fixas que deram baixa" valor={String(resultado.contasFixasPagas)} />
            )}
            {resultado.faturasPagas > 0 && <Linha rotulo="Faturas que deram baixa" valor={String(resultado.faturasPagas)} />}
            {resultado.transferencias > 0 && <Linha rotulo="Transferências entre contas suas" valor={String(resultado.transferencias)} />}
          </Card>

          {resultado.comparacao && (
            <Card>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                Gastos em {formatarMesReferencia(resultado.comparacao.mes)}
              </Text>
              <Text className="font-heading" style={{ color: colors.text, fontSize: 24, marginTop: 2 }}>
                {formatarMoeda(resultado.comparacao.total)}
              </Text>
              {variacao !== null && (
                <Text className="font-body" style={{ color: variacao > 0 ? colors.danger : colors.success, fontSize: 12, marginTop: 2 }}>
                  {variacao === 0
                    ? 'Igual ao mês anterior'
                    : `${Math.abs(variacao)}% ${variacao > 0 ? 'a mais' : 'a menos'} que o mês anterior (${formatarMoeda(resultado.comparacao.anterior)})`}
                </Text>
              )}
            </Card>
          )}

          {resultado.porCategoria.length > 0 && (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 10 }}>
                Gastos por categoria
              </Text>
              {resultado.porCategoria.slice(0, 8).map((c) => (
                <View key={String(c.categoriaId)} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text className="font-body" style={{ color: colors.text, fontSize: 13 }}>
                      {c.nome}
                    </Text>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {formatarMoeda(c.total)}
                    </Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${maior > 0 ? (c.total / maior) * 100 : 0}%`, height: 8, backgroundColor: c.cor }} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          {resultado.foraDoPadrao.length > 0 && (
            <Card style={{ borderColor: colors.warning }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>
                Fora do padrão
              </Text>
              {resultado.foraDoPadrao.slice(0, 5).map((f) => (
                <View key={f.id} style={{ paddingVertical: 6 }}>
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                    {f.descricao} · {formatarMoeda(f.valor)}
                  </Text>
                  <Text className="font-body" style={{ color: colors.warning, fontSize: 12 }}>
                    {f.motivo} (média {formatarMoeda(f.media)})
                  </Text>
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
              Próximos meses
            </Text>
            <GraficoProjecao projecao={projecao} />
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
              Inclui contas fixas e parcelas, com as que você criar respondendo as perguntas.
            </Text>
          </Card>

          <Button titulo="Concluir" onPress={() => router.replace('/dashboard')} />
          <Button titulo="Desfazer esta importação" variante="secundaria" onPress={confirmarDesfazer} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
