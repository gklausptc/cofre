import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { MonthSelector } from '@/components/MonthSelector';
import { ChipSelect } from '@/components/ChipSelect';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import { formatarData, hojeIso, mesAnterior, mesAtualIso, mesSeguinte } from '@/core/utils/date';
import { formatarMoeda } from '@/core/utils/currency';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

type Tipo = 'todos' | 'saidas' | 'entradas' | 'cartao' | 'transferencias' | 'guardado';
const TODOS = 'todos';

/** O que entra no extrato: o que aconteceu de fato (contas fixas e faturas ficam na Agenda). */
const NO_EXTRATO: LancamentoDoPeriodo['tipo'][] = ['movimentacao', 'gasto', 'parcela', 'aporte_cofrinho', 'reserva'];

function passaNoTipo(l: LancamentoDoPeriodo, tipo: Tipo): boolean {
  if (tipo === 'saidas') return l.natureza === 'despesa' || l.natureza === 'pagamento';
  if (tipo === 'entradas') return l.natureza === 'receita';
  if (tipo === 'cartao') return l.noCartao;
  if (tipo === 'transferencias') return l.natureza === 'transferencia';
  if (tipo === 'guardado') return l.natureza === 'guardado' || l.natureza === 'resgate';
  return true;
}

const entra = (l: LancamentoDoPeriodo) => l.natureza === 'receita' || l.natureza === 'resgate';

/**
 * Extrato: tudo o que aconteceu no mês (movimentações, gastos, compras e parcelas no cartão,
 * guardado), numa lista só, agrupada por dia, com filtros por tipo, conta, cartão, categoria e
 * membro, e a busca.
 */
export default function ExtratoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, contas, categorias, carregarTudo } = useDadosFinanceiros();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const [mes, setMes] = useState(mesAtualIso());
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [onde, setOnde] = useState<string>(TODOS);
  const [categoria, setCategoria] = useState<string>(TODOS);
  const [membro, setMembro] = useState<string>(TODOS);
  const [verFiltros, setVerFiltros] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
      carregarMembros();
    }, [carregarTudo, carregarMembros])
  );

  const doMes = useMemo(
    () =>
      obterLancamentosDoPeriodo(`${mes}-01`, dataNoMes(mes, 31), dados, hojeIso()).filter((l) => NO_EXTRATO.includes(l.tipo)),
    [dados, mes]
  );
  const reservadosParaOProximoMes = useMemo(
    () => new Set((dados.movimentacoes ?? []).filter((m) => m.reservarProximoMes).map((m) => `mov-${m.id}`)),
    [dados.movimentacoes]
  );

  const filtrados = doMes.filter((l) => {
    if (!passaNoTipo(l, tipo)) return false;
    if (onde !== TODOS) {
      const [qual, id] = onde.split('-');
      if (qual === 'conta' && l.contaBancariaId !== Number(id)) return false;
      if (qual === 'cartao' && l.cartaoId !== Number(id)) return false;
    }
    if (categoria !== TODOS && l.categoriaId !== Number(categoria)) return false;
    if (membro !== TODOS && l.membroId !== Number(membro)) return false;
    return true;
  });
  const secoes = useMemo(() => {
    const porDia = new Map<string, LancamentoDoPeriodo[]>();
    for (const l of [...filtrados].sort((a, b) => b.data.localeCompare(a.data))) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);
    return [...porDia].map(([dia, data]) => ({
      dia,
      data,
      saldo: data.reduce((s, l) => s + (entra(l) ? l.valor : l.natureza === 'transferencia' ? 0 : -l.valor), 0),
    }));
  }, [filtrados]);

  const entrou = filtrados.filter((l) => l.natureza === 'receita').reduce((s, l) => s + l.valor, 0);
  const gastou = filtrados.filter((l) => l.natureza === 'despesa').reduce((s, l) => s + l.valor, 0);
  const filtrosAtivos = [onde, categoria, membro].filter((f) => f !== TODOS).length + (tipo !== 'todos' ? 1 : 0);
  const membrosPorId = new Map(membros.map((m) => [m.id, m]));
  const nomeDaCategoria = (id: number | null) => (id !== null ? (categorias.find((c) => c.id === id)?.nome ?? null) : null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <SectionList
        sections={secoes}
        keyExtractor={(l) => l.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 20 }}>
              <ScreenHeader title="Extrato" subtitle="Tudo o que entrou e saiu no mês" />
              <Pressable
                onPress={() => router.push('/busca')}
                accessibilityRole="button"
                accessibilityLabel="Buscar lançamentos"
                hitSlop={8}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', marginRight: 4 }}
              >
                <Feather name="search" size={20} color={colors.brand} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/acoes')}
                accessibilityRole="button"
                accessibilityLabel="Lançar"
                style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="plus" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
            <MonthSelector mesReferencia={mes} onAnterior={() => setMes(mesAnterior(mes))} onProximo={() => setMes(mesSeguinte(mes))} />

            <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 12 }}>
              <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                    Entrou
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.success, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                    {formatarMoeda(entrou)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                    Gastos
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.danger, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                    {formatarMoeda(gastou)}
                  </Text>
                </View>
              </Card>

              <ChipSelect<Tipo>
                label="Mostrar"
                opcoes={[
                  { valor: 'todos', rotulo: 'Tudo' },
                  { valor: 'saidas', rotulo: 'Saídas' },
                  { valor: 'entradas', rotulo: 'Entradas' },
                  { valor: 'cartao', rotulo: 'No cartão' },
                  { valor: 'transferencias', rotulo: 'Transferências' },
                  { valor: 'guardado', rotulo: 'Guardado' },
                ]}
                valor={tipo}
                onSelecionar={setTipo}
              />
              <Pressable onPress={() => setVerFiltros((v) => !v)} accessibilityRole="button" style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="sliders" size={14} color={colors.brand} />
                <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
                  {verFiltros ? 'Esconder filtros' : `Filtros${filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}`}
                </Text>
              </Pressable>
              {verFiltros && (
                <Card>
                  <ChipSelect
                    label="Conta ou cartão"
                    opcoes={[
                      { valor: TODOS, rotulo: 'Todos' },
                      ...contas.map((c) => ({ valor: `conta-${c.id}`, rotulo: c.nomeConta })),
                      ...(dados.cartoes ?? []).map((c) => ({ valor: `cartao-${c.id}`, rotulo: c.nome })),
                    ]}
                    valor={onde}
                    onSelecionar={setOnde}
                  />
                  <ChipSelect
                    label="Categoria"
                    opcoes={[{ valor: TODOS, rotulo: 'Todas' }, ...categorias.map((c) => ({ valor: String(c.id), rotulo: c.nome }))]}
                    valor={categoria}
                    onSelecionar={setCategoria}
                  />
                  {membros.length > 0 && (
                    <ChipSelect
                      label="Membro"
                      opcoes={[{ valor: TODOS, rotulo: 'Todos' }, ...membros.map((m) => ({ valor: String(m.id), rotulo: m.nome }))]}
                      valor={membro}
                      onSelecionar={setMembro}
                    />
                  )}
                </Card>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          doMes.length === 0 ? (
            <EmptyState
              icon="list"
              titulo="Nada neste mês"
              descricao="Importe o extrato do banco ou lance um gasto pelo botão + embaixo."
              acao={{ rotulo: 'Importar extrato', onPress: () => router.push('/importar-extrato') }}
            />
          ) : (
            <EmptyState icon="filter" titulo="Nada com esses filtros" descricao="Tire algum filtro para ver mais lançamentos." />
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>
            <Text className="font-heading-medium" style={{ color: colors.textMuted, fontSize: 12 }}>
              {formatarData(section.dia, "EEEE, d 'de' MMMM").replace(/^./, (c) => c.toUpperCase())}
            </Text>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
              {section.saldo > 0 ? '+' : ''}
              {formatarMoeda(section.saldo)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const m = item.membroId !== null ? membrosPorId.get(item.membroId) : undefined;
          const categoriaNome = nomeDaCategoria(item.categoriaId);
          const detalhe = [
            item.noCartao ? 'cartão' : null,
            item.natureza === 'transferencia' ? 'transferência' : null,
            item.natureza === 'pagamento' ? 'pagamento' : null,
            item.natureza === 'guardado' ? 'guardado' : item.natureza === 'resgate' ? 'resgate' : null,
            categoriaNome,
            item.status === 'previsto' ? 'previsto' : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable onPress={() => router.push(item.link as Href)} accessibilityRole="button" style={{ marginHorizontal: 20, marginBottom: 8 }}>
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
                      {item.descricao}
                    </Text>
                    {reservadosParaOProximoMes.has(item.id) && <Feather name="clock" size={12} color={colors.textMuted} />}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {detalhe !== '' && (
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                        {detalhe}
                      </Text>
                    )}
                    {m && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.cor }} />
                        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                          {m.nome}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text
                  className="font-heading-medium"
                  style={{
                    color: entra(item) ? colors.success : item.natureza === 'transferencia' ? colors.text : colors.danger,
                    fontSize: 14,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {entra(item) ? '+' : item.natureza === 'transferencia' ? '' : '−'}
                  {formatarMoeda(item.valor)}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.textMuted} style={{ marginLeft: 8 }} />
              </Card>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
