import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { EmptyState } from '@/components/EmptyState';
import { MonthSelector } from '@/components/MonthSelector';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData, formatarMesReferencia, hojeIso, mesAnterior, mesAtualIso, mesSeguinte } from '@/core/utils/date';
import { useOrcamentosStore } from '@/store/orcamentosStore';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { orcamentoDoMes, progressoDosOrcamentos, sugerirOrcamentos, type ProgressoDoOrcamento } from '@/domain/usecases/automacoes/orcamento';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import type { Categoria } from '@/domain/types/entities';

const nomeDoMes = (mes: string) => formatarMesReferencia(mes).split(' ')[0];

function Barra({ proporcao, cor }: { proporcao: number; cor: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(1, proporcao) * 100}%`, height: 8, backgroundColor: cor }} />
    </View>
  );
}

function Editor({
  categoria,
  mes,
  limiteAtual,
  onFechar,
}: {
  categoria: Pick<Categoria, 'id' | 'nome'>;
  mes: string;
  limiteAtual: number | null;
  onFechar: () => void;
}) {
  const { colors } = useAppTheme();
  const { definir, remover } = useOrcamentosStore();
  const [limite, setLimite] = useState(limiteAtual ?? 0);
  const [quando, setQuando] = useState<'todo' | 'so'>('todo');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await definir({ categoriaId: categoria.id, mesInicio: mes, limite, apenasNoMes: quando === 'so' });
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
      <CurrencyInput label={`Limite para ${categoria.nome}`} valor={limite} onChangeValor={setLimite} />
      <ChipSelect
        label="Vale"
        opcoes={[
          { valor: 'todo', rotulo: `Todo mês, a partir de ${nomeDoMes(mes)}` },
          { valor: 'so', rotulo: `Só em ${nomeDoMes(mes)}` },
        ]}
        valor={quando}
        onSelecionar={setQuando}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {limiteAtual !== null && (
          <View style={{ flex: 1 }}>
            <Button
              titulo="Tirar limite"
              variante="secundaria"
              onPress={async () => {
                await remover(categoria.id, mes);
                onFechar();
              }}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Button titulo="Salvar" onPress={salvar} disabled={limite <= 0} carregando={salvando} />
        </View>
      </View>
    </View>
  );
}

/** Orçamento do mês: limite por categoria, com a sugestão pela média dos 3 meses anteriores. */
export default function OrcamentoScreen() {
  const { colors } = useAppTheme();
  const { orcamentos, carregar, definirVarios } = useOrcamentosStore();
  const { dados, categorias, carregarTudo } = useDadosFinanceiros();
  const [mes, setMes] = useState(mesAtualIso());
  const [aberta, setAberta] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarTudo();
    }, [carregar, carregarTudo])
  );

  const lancamentos = useMemo(() => {
    const inicio = `${mesAnterior(mesAnterior(mesAnterior(mesAnterior(mes))))}-01`;
    return obterLancamentosDoPeriodo(inicio, dataNoMes(mes, 31), dados, hojeIso());
  }, [dados, mes]);
  const progresso = useMemo(() => progressoDosOrcamentos(orcamentos, categorias, lancamentos, mes), [orcamentos, categorias, lancamentos, mes]);
  const sugestoes = useMemo(
    () => sugerirOrcamentos(lancamentos, categorias, mes).filter((s) => (orcamentoDoMes(orcamentos, s.categoriaId, mes) ?? 0) <= 0),
    [lancamentos, categorias, mes, orcamentos]
  );
  const semOrcamento = categorias.filter(
    (c) => c.tipo === 'despesa' && !progresso.itens.some((i) => i.categoriaId === c.id) && !sugestoes.some((s) => s.categoriaId === c.id)
  );

  const corDa = (item: ProgressoDoOrcamento) =>
    item.situacao === 'estourado' ? colors.danger : item.situacao === 'atencao' ? colors.warning : item.cor;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Orçamento do mês" subtitle="Quanto cada categoria pode gastar" />
        <MonthSelector mesReferencia={mes} onAnterior={() => setMes(mesAnterior(mes))} onProximo={() => setMes(mesSeguinte(mes))} />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {progresso.itens.length > 0 && (
            <Card>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                Orçado {formatarMoeda(progresso.orcado)} · Gasto {formatarMoeda(progresso.gasto)}
              </Text>
              <View style={{ marginTop: 8 }}>
                <Barra
                  proporcao={progresso.orcado > 0 ? progresso.gasto / progresso.orcado : 0}
                  cor={progresso.gasto > progresso.orcado ? colors.danger : colors.brand}
                />
              </View>
            </Card>
          )}

          {sugestoes.length > 0 && (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                Sugestões pela média
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
                De {nomeDoMes(sugestoes[0].meses[0])} a {nomeDoMes(sugestoes[0].meses[2])}, arredondado para cima.
              </Text>
              {sugestoes.length > 1 && (
                <View style={{ marginBottom: 10 }}>
                  <Button
                    titulo={`Usar todas as sugestões (${sugestoes.length})`}
                    onPress={() =>
                      definirVarios(sugestoes.map((s) => ({ categoriaId: s.categoriaId, mesInicio: mes, limite: s.sugestao, apenasNoMes: false })))
                    }
                  />
                </View>
              )}
              {sugestoes.map((s) => (
                <View
                  key={s.categoriaId}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <View style={{ flex: 1 }}>
                    <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
                      {s.nome}
                    </Text>
                    <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                      Média: {formatarMoeda(s.media)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => definirVarios([{ categoriaId: s.categoriaId, mesInicio: mes, limite: s.sugestao, apenasNoMes: false }])}
                    accessibilityRole="button"
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                  >
                    <Text className="font-heading-medium" style={{ color: colors.brand, fontSize: 13 }}>
                      Usar {formatarMoeda(s.sugestao)}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          )}

          {progresso.itens.length === 0 && sugestoes.length === 0 && (
            <EmptyState
              icon="pie-chart"
              titulo="Nenhum limite definido"
              descricao="Com 1 mês de lançamentos o app sugere os limites. Ou defina um para qualquer categoria abaixo."
            />
          )}

          {progresso.itens.map((item) => (
            <Card key={item.categoriaId}>
              <Pressable onPress={() => setAberta(aberta === item.categoriaId ? null : item.categoriaId)} accessibilityRole="button">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
                    {item.nome}
                  </Text>
                  <Text className="font-heading-medium" style={{ color: corDa(item), fontSize: 13, fontVariant: ['tabular-nums'] }}>
                    {formatarMoeda(item.gasto)} de {formatarMoeda(item.limite)}
                  </Text>
                </View>
                <Barra proporcao={item.proporcao} cor={corDa(item)} />
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  {item.situacao === 'estourado'
                    ? `Passou ${formatarMoeda(item.gasto - item.limite)}`
                    : `Sobram ${formatarMoeda(item.limite - item.gasto)} · ${Math.round(item.proporcao * 100)}% usado`}
                </Text>
              </Pressable>
              {aberta === item.categoriaId && (
                <Editor categoria={{ id: item.categoriaId, nome: item.nome }} mes={mes} limiteAtual={item.limite} onFechar={() => setAberta(null)} />
              )}
            </Card>
          ))}

          {semOrcamento.length > 0 && (
            <Card>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
                Definir limite
              </Text>
              {semOrcamento.map((c) => (
                <View key={c.id} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Pressable
                    onPress={() => setAberta(aberta === c.id ? null : c.id)}
                    accessibilityRole="button"
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
                      {c.nome}
                    </Text>
                  </Pressable>
                  {aberta === c.id && <Editor categoria={c} mes={mes} limiteAtual={null} onFechar={() => setAberta(null)} />}
                </View>
              ))}
            </Card>
          )}

          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
            Compras no cartão contam no mês da fatura. Pagamento de fatura e transferências não contam. Hoje é{' '}
            {formatarData(hojeIso())}.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
