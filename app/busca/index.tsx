import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { addDays, format } from 'date-fns';
import { TextField } from '@/components/TextField';
import { ChipSelect } from '@/components/ChipSelect';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, hojeIso } from '@/core/utils/date';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { buscarLancamentos } from '@/domain/usecases/automacoes/busca';

type Periodo = 'tudo' | '30' | '90' | '365';
const TODAS = 'todas';

/** Busca em todos os lançamentos por texto, valor, categoria e período. */
export default function BuscaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, categorias, carregarTudo } = useDadosFinanceiros();
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState<string>(TODAS);
  const [periodo, setPeriodo] = useState<Periodo>('tudo');

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
    }, [carregarTudo])
  );

  const hoje = hojeIso();
  const todos = useMemo(
    () => obterLancamentosDoPeriodo('1900-01-01', format(addDays(new Date(), 400), 'yyyy-MM-dd'), dados, hoje),
    [dados, hoje]
  );
  const resultados = useMemo(() => {
    const inicio = periodo === 'tudo' ? null : format(addDays(new Date(), -Number(periodo)), 'yyyy-MM-dd');
    return buscarLancamentos(todos, {
      texto,
      categoriaId: categoria === TODAS ? null : Number(categoria),
      inicio,
      fim: null,
    }).slice(0, 300);
  }, [todos, texto, categoria, periodo]);
  const nomeDaCategoria = (id: number | null) => categorias.find((c) => c.id === id)?.nome ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <FlatList
        data={resultados}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 8 }}
        ListHeaderComponent={
          <View>
            <TextField label="Buscar" placeholder="Descrição ou valor (ex.: 45,90)" value={texto} onChangeText={setTexto} autoFocus />
            <ChipSelect<Periodo>
              label="Período"
              opcoes={[
                { valor: 'tudo', rotulo: 'Tudo' },
                { valor: '30', rotulo: '30 dias' },
                { valor: '90', rotulo: '90 dias' },
                { valor: '365', rotulo: '1 ano' },
              ]}
              valor={periodo}
              onSelecionar={setPeriodo}
            />
            <ChipSelect
              label="Categoria"
              opcoes={[{ valor: TODAS, rotulo: 'Todas' }, ...categorias.map((c) => ({ valor: String(c.id), rotulo: c.nome }))]}
              valor={categoria}
              onSelecionar={setCategoria}
            />
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              {resultados.length === 300 ? 'Mostrando os 300 mais recentes' : `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}`}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const entrada = item.natureza === 'receita' || item.natureza === 'resgate';
          return (
            <Pressable onPress={() => router.push(item.link as Href)} accessibilityRole="button">
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                    {item.descricao}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                    {formatarData(item.data)}
                    {nomeDaCategoria(item.categoriaId) ? ` · ${nomeDaCategoria(item.categoriaId)}` : ''}
                    {item.status === 'previsto' ? ' · previsto' : item.status === 'atrasado' ? ' · atrasado' : ''}
                  </Text>
                </View>
                <Text
                  className="font-heading-medium"
                  style={{ color: entrada ? colors.success : colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}
                >
                  {entrada ? '+' : ''}
                  {formatarMoeda(item.valor)}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
