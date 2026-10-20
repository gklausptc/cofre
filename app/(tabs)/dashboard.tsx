import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { AvisoPendencias } from '@/components/AvisoPendencias';
import { AutomacoesDoInicio } from '@/components/inicio/AutomacoesDoInicio';
import { Snackbar } from '@/components/Snackbar';
import { NOME_DO_APP } from '@/core/marca';
import { useOrcamentosStore } from '@/store/orcamentosStore';
import { usePerguntasStore } from '@/store/perguntasStore';
import { EmptyState } from '@/components/EmptyState';
import { GraficoProjecao } from '@/components/GraficoProjecao';
import { TourTarget } from '@/components/TourTarget';
import { TourOverlay } from '@/components/TourOverlay';
import { useTourStore } from '@/store/tourStore';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useReservaEmergenciaStore } from '@/store/reservaEmergenciaStore';
import { useCofrinhosStore } from '@/store/cofrinhosStore';
import { useAportesCofrinhoStore } from '@/store/aportesCofrinhoStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useContasFixasStore } from '@/store/contasFixasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useFaturasStore } from '@/store/faturasStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { calcularSaldoTotal } from '@/domain/usecases/calcularSaldoConta';
import { unificarLancamentos } from '@/domain/usecases/unificarLancamentos';
import { calcularResumoMensal } from '@/domain/usecases/calcularResumoMensal';
import { calcularGastosPorCategoria } from '@/domain/usecases/calcularGastosPorCategoria';
import { calcularGastosFixosDoMes } from '@/domain/usecases/calcularGastosFixosDoMes';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { calcularLivreParaGastar } from '@/domain/usecases/calcularLivreParaGastar';
import { calcularPagamentosDoMes } from '@/domain/usecases/calcularPagamentosDoMes';
import { projetarFluxoCaixa } from '@/domain/usecases/projetarFluxoCaixa';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import { formatarData, hojeIso, mesAnterior, mesAtualIso } from '@/core/utils/date';
import { addDays, format, getDaysInMonth, parseISO } from 'date-fns';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

const MES_ATUAL = mesAtualIso();

type AcaoRapida = { icon: React.ComponentProps<typeof Feather>['name']; rotulo: string; href: Href };

const ACOES_RAPIDAS: AcaoRapida[] = [
  { icon: 'upload', rotulo: 'Importar extrato', href: '/importar-extrato' },
  { icon: 'arrow-up-right', rotulo: 'Movimentação', href: '/movimentacao/novo' },
  { icon: 'zap', rotulo: 'Gasto rápido', href: '/gasto-rapido' },
  { icon: 'dollar-sign', rotulo: 'Conta bancária', href: '/conta-bancaria/novo' },
  { icon: 'file-text', rotulo: 'Conta fixa', href: '/conta-fixa/novo' },
  { icon: 'gift', rotulo: 'Cofrinho', href: '/cofrinho/novo' },
];

const PROXIMO_TEMA = { sistema: 'claro', claro: 'escuro', escuro: 'sistema' } as const;
const ICONE_TEMA: Record<'sistema' | 'claro' | 'escuro', React.ComponentProps<typeof Feather>['name']> = {
  sistema: 'smartphone',
  claro: 'sun',
  escuro: 'moon',
};

export default function DashboardScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { preferencias, atualizar: atualizarPreferencias } = usePreferenciasStore();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { reserva, historico: historicoReserva, carregar: carregarReserva } = useReservaEmergenciaStore();
  const { cofrinhos, carregar: carregarCofrinhos } = useCofrinhosStore();
  const { aportes, carregar: carregarAportes } = useAportesCofrinhoStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { contas: contasFixas, carregar: carregarContasFixas } = useContasFixasStore();
  const { parcelas, carregar: carregarParcelas, marcarPaga } = useParcelasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { faturas, carregar: carregarFaturas } = useFaturasStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { perguntas, carregar: carregarPerguntas } = usePerguntasStore();
  const { carregar: carregarOrcamentos } = useOrcamentosStore();
  const [aviso, setAviso] = useState<{ mensagem: string; desfazer: (() => void) | null } | null>(null);
  const fecharAviso = useCallback(() => setAviso(null), []);

  const [membroSelecionadoId, setMembroSelecionadoId] = useState<number | null>(null);
  const [verConta, setVerConta] = useState(false);
  const [verFixos, setVerFixos] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarContas();
      carregarMovimentacoes();
      carregarGastos();
      carregarCategorias();
      carregarReserva();
      carregarCofrinhos();
      carregarAportes();
      carregarMembros();
      carregarContasFixas();
      carregarParcelas();
      carregarCartoes();
      carregarCompras();
      carregarFaturas();
      carregarPerguntas();
      carregarOrcamentos();
    }, [
      carregarContas,
      carregarMovimentacoes,
      carregarGastos,
      carregarCategorias,
      carregarReserva,
      carregarCofrinhos,
      carregarAportes,
      carregarMembros,
      carregarContasFixas,
      carregarParcelas,
      carregarCartoes,
      carregarCompras,
      carregarFaturas,
      carregarPerguntas,
      carregarOrcamentos,
    ])
  );

  const movimentacoesFiltradas = useMemo(
    () =>
      membroSelecionadoId === null
        ? movimentacoes
        : movimentacoes.filter((m) => m.membroId === membroSelecionadoId),
    [movimentacoes, membroSelecionadoId]
  );
  const gastosFiltrados = useMemo(
    () => (membroSelecionadoId === null ? gastos : gastos.filter((g) => g.membroId === membroSelecionadoId)),
    [gastos, membroSelecionadoId]
  );
  const contasFixasFiltradas = useMemo(
    () =>
      membroSelecionadoId === null
        ? contasFixas
        : contasFixas.filter((c) => c.membroId === membroSelecionadoId),
    [contasFixas, membroSelecionadoId]
  );

  const comprasFiltradas = useMemo(
    () => (membroSelecionadoId === null ? compras : compras.filter((c) => c.membroId === membroSelecionadoId)),
    [compras, membroSelecionadoId]
  );

  const parcelasFiltradas = useMemo(() => {
    if (membroSelecionadoId === null) return parcelas;
    const idsFixas = new Set(contasFixasFiltradas.map((c) => c.id));
    const idsCompras = new Set(comprasFiltradas.map((c) => c.id));
    return parcelas.filter(
      (p) =>
        (p.contaFixaId !== null && idsFixas.has(p.contaFixaId)) ||
        (p.compraParceladaId !== null && idsCompras.has(p.compraParceladaId))
    );
  }, [parcelas, membroSelecionadoId, contasFixasFiltradas, comprasFiltradas]);

  // Livre para gastar: calculado da lista unificada de lançamentos (do mês passado até o
  // fim deste, porque entrada reservada no mês anterior pesa neste). Com filtro de membro,
  // só entram os lançamentos dele; cofrinhos e reserva são da casa toda.
  const livre = useMemo(() => {
    const semFiltro = membroSelecionadoId === null;
    const lancamentos = obterLancamentosDoPeriodo(
      `${mesAnterior(MES_ATUAL)}-01`,
      dataNoMes(MES_ATUAL, 31),
      {
        movimentacoes: movimentacoesFiltradas,
        gastos: gastosFiltrados,
        parcelas: parcelasFiltradas,
        contasFixas: contasFixasFiltradas,
        comprasParceladas: comprasFiltradas,
        cartoes,
        faturas,
        cofrinhos: semFiltro ? cofrinhos : [],
        aportesCofrinho: semFiltro ? aportes : [],
        movimentacoesReserva: semFiltro ? historicoReserva : [],
      },
      hojeIso()
    );
    return calcularLivreParaGastar(lancamentos, MES_ATUAL, hojeIso());
  }, [
    membroSelecionadoId,
    movimentacoesFiltradas,
    gastosFiltrados,
    parcelasFiltradas,
    contasFixasFiltradas,
    comprasFiltradas,
    cartoes,
    faturas,
    cofrinhos,
    aportes,
    historicoReserva,
  ]);

  const saldoTotal = useMemo(
    () => calcularSaldoTotal(contas, movimentacoes, gastos),
    [contas, movimentacoes, gastos]
  );
  const resumoMensal = useMemo(
    () => calcularResumoMensal(movimentacoesFiltradas, gastosFiltrados, MES_ATUAL, parcelasFiltradas),
    [movimentacoesFiltradas, gastosFiltrados, parcelasFiltradas]
  );
  const gastosPorCategoria = useMemo(
    () => calcularGastosPorCategoria(movimentacoesFiltradas, gastosFiltrados, categorias, MES_ATUAL).slice(0, 5),
    [movimentacoesFiltradas, gastosFiltrados, categorias]
  );
  const gastosFixos = useMemo(
    () => calcularGastosFixosDoMes(contasFixasFiltradas, parcelas, MES_ATUAL, comprasFiltradas, cartoes, gastosFiltrados),
    [contasFixasFiltradas, parcelas, comprasFiltradas, cartoes, gastosFiltrados]
  );
  const lancamentos = useMemo(
    () => unificarLancamentos(movimentacoesFiltradas, gastosFiltrados).slice(0, 5),
    [movimentacoesFiltradas, gastosFiltrados]
  );
  const membrosPorId = useMemo(() => new Map(membros.map((m) => [m.id, m])), [membros]);

  const valorCofrinhos = useMemo(
    () => aportes.reduce((soma, a) => soma + a.valor, 0),
    [aportes]
  );

  // próximos 7 dias e faturas em aberto, da lista unificada (com o filtro de membro)
  const hoje = hojeIso();
  const lancamentosProximos = useMemo(
    () =>
      obterLancamentosDoPeriodo(
        format(addDays(parseISO(hoje), -35), 'yyyy-MM-dd'),
        format(addDays(parseISO(hoje), 70), 'yyyy-MM-dd'),
        {
          movimentacoes: movimentacoesFiltradas,
          gastos: gastosFiltrados,
          parcelas: parcelasFiltradas,
          contasFixas: contasFixasFiltradas,
          comprasParceladas: comprasFiltradas,
          cartoes,
          faturas,
        },
        hoje
      ),
    [hoje, movimentacoesFiltradas, gastosFiltrados, parcelasFiltradas, contasFixasFiltradas, comprasFiltradas, cartoes, faturas]
  );
  const limiteDaSemana = format(addDays(parseISO(hoje), 7), 'yyyy-MM-dd');
  const proximos = lancamentosProximos
    .filter((l: LancamentoDoPeriodo) => l.status !== 'pago' && l.data <= limiteDaSemana)
    .filter((l) => (l.tipo === 'conta_fixa' && !l.noCartao) || (l.tipo === 'fatura' && l.valor > 0) || (l.natureza === 'receita' && l.data >= hoje))
    .sort((a, b) => a.data.localeCompare(b.data));
  const faturasEmAberto = lancamentosProximos
    .filter((l) => l.natureza === 'fatura' && l.status !== 'pago' && l.competencia >= MES_ATUAL)
    .reduce((s, l) => s + l.valor, 0);
  const pagamentosDoMes = useMemo(
    () => calcularPagamentosDoMes(contasFixasFiltradas, parcelasFiltradas, comprasFiltradas, cartoes, gastosFiltrados, faturas, MES_ATUAL),
    [contasFixasFiltradas, parcelasFiltradas, comprasFiltradas, cartoes, gastosFiltrados, faturas]
  );
  const projecao = useMemo(
    () => projetarFluxoCaixa(3, parcelasFiltradas, movimentacoesFiltradas, gastosFiltrados, contasFixasFiltradas, comprasFiltradas, cartoes),
    [parcelasFiltradas, movimentacoesFiltradas, gastosFiltrados, contasFixasFiltradas, comprasFiltradas, cartoes]
  );

  // ritmo: quanto do que sobrou para gastar no mês (fora do cartão) já foi gasto, contra o
  // quanto do mês já passou
  const diasNoMes = getDaysInMonth(parseISO(`${MES_ATUAL}-01`));
  const diasPassados = Number(hoje.slice(8, 10));
  const disponivelNoMes = livre.livre + livre.gastos;
  const ritmo =
    disponivelNoMes > 0
      ? {
          gasto: livre.gastos / disponivelNoMes,
          esperado: diasPassados / diasNoMes,
          diferenca: livre.gastos - Math.round((disponivelNoMes * diasPassados) / diasNoMes),
        }
      : null;

  const positivo = resumoMensal.saldo >= 0;
  const tema = preferencias?.tema ?? 'sistema';

  function handleAlternarTema() {
    atualizarPreferencias({ tema: PROXIMO_TEMA[tema] });
  }

  const iniciarTour = useTourStore((s) => s.iniciar);
  const tutorialConcluido = preferencias?.tutorialConcluido ?? true;

  useEffect(() => {
    if (!tutorialConcluido) {
      iniciarTour(() => atualizarPreferencias({ tutorialConcluido: true }));
    }
  }, [tutorialConcluido, iniciarTour, atualizarPreferencias]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 }}>
          <ScreenHeader title={NOME_DO_APP} subtitle="Seu dinheiro, sob controle" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => router.push('/ajuda')}
            accessibilityRole="button"
            accessibilityLabel="Ajuda e assistente"
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="help-circle" size={16} color={colors.brand} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/busca')}
            accessibilityRole="button"
            accessibilityLabel="Buscar lançamentos"
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="search" size={16} color={colors.brand} />
          </Pressable>
          <TourTarget id="tema">
            <Pressable
              onPress={handleAlternarTema}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name={ICONE_TEMA[tema]} size={16} color={colors.brand} />
            </Pressable>
          </TourTarget>
          <TourTarget id="menu">
            <Pressable
              onPress={() => router.push('/mais')}
              accessibilityRole="button"
              accessibilityLabel="Mais: contas, cartões, relatórios e configurações"
              style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="menu" size={16} color={colors.brand} />
            </Pressable>
          </TourTarget>
          </View>
        </View>

        {membros.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 12 }}
          >
            <Pressable
              onPress={() => setMembroSelecionadoId(null)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: membroSelecionadoId === null ? colors.brand : colors.surface,
                borderWidth: 1,
                borderColor: membroSelecionadoId === null ? colors.brand : colors.border,
              }}
            >
              <Text
                className="font-body-medium"
                style={{ color: membroSelecionadoId === null ? '#FFFFFF' : colors.text, fontSize: 12 }}
              >
                Todos
              </Text>
            </Pressable>
            {membros.map((membro) => {
              const ativo = membro.id === membroSelecionadoId;
              return (
                <Pressable
                  key={membro.id}
                  onPress={() => setMembroSelecionadoId(ativo ? null : membro.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: ativo ? membro.cor : colors.surface,
                    borderWidth: 1,
                    borderColor: ativo ? membro.cor : colors.border,
                  }}
                >
                  <Text
                    className="font-body-medium"
                    style={{ color: ativo ? '#FFFFFF' : colors.text, fontSize: 12 }}
                  >
                    {membro.nome}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <TourTarget id="livre" style={{ marginHorizontal: 20 }}>
          <Pressable onPress={() => setVerConta((v) => !v)} accessibilityRole="button" accessibilityLabel="Livre para gastar. Toque para ver a conta">
            <Card style={{ borderColor: livre.livre < 0 ? colors.danger : colors.border }}>
              <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 13 }}>
                Livre para gastar até {formatarData(dataNoMes(MES_ATUAL, diasNoMes), 'dd/MM')}
              </Text>
              <Text
                className="font-heading"
                style={{ color: livre.livre < 0 ? colors.danger : colors.text, fontSize: 32, marginTop: 4, fontVariant: ['tabular-nums'] }}
              >
                {formatarMoeda(livre.livre)}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                {livre.porDia > 0
                  ? `≈ ${formatarMoeda(livre.porDia)} por dia nos próximos ${livre.diasRestantes} ${livre.diasRestantes === 1 ? 'dia' : 'dias'}`
                  : livre.livre < 0
                    ? 'As saídas previstas do mês já passam das entradas.'
                    : 'Nada livre até o fim do mês.'}
              </Text>
              {ritmo && (
                <View style={{ marginTop: 12 }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.min(1, ritmo.gasto) * 100}%`,
                        height: 8,
                        backgroundColor: ritmo.diferenca > 0 ? colors.warning : colors.brand,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      position: 'absolute',
                      left: `${Math.min(1, ritmo.esperado) * 100}%`,
                      top: -3,
                      width: 2,
                      height: 14,
                      backgroundColor: colors.text,
                    }}
                  />
                  <Text className="font-body" style={{ color: ritmo.diferenca > 0 ? colors.warning : colors.textMuted, fontSize: 11, marginTop: 6 }}>
                    {ritmo.diferenca > 0
                      ? `Acima do ritmo: ${formatarMoeda(ritmo.diferenca)} a mais do que o esperado até hoje`
                      : 'Dentro do ritmo do mês'}
                  </Text>
                </View>
              )}
              {verConta && (
                <View style={{ marginTop: 12, gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                  {[
                    { rotulo: 'Entradas do mês', valor: livre.receitas, sinal: '+' },
                    { rotulo: 'Contas fixas', valor: livre.contasFixas, sinal: '−' },
                    { rotulo: 'Faturas de cartão', valor: livre.faturas, sinal: '−' },
                    { rotulo: 'Gastos fora do cartão', valor: livre.gastos, sinal: '−' },
                    { rotulo: 'Guardado em metas', valor: livre.guardado, sinal: '−' },
                  ].map((linha) => (
                    <View key={linha.rotulo} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                        {linha.rotulo}
                      </Text>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                        {linha.sinal} {formatarMoeda(linha.valor)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12, marginTop: 8 }}>
                {verConta ? 'Esconder a conta' : 'Ver a conta'}
              </Text>
            </Card>
          </Pressable>
        </TourTarget>

        <View style={{ height: 12 }} />
        <TourTarget id="pendencias">
          <AvisoPendencias quantidade={perguntas.length} />
        </TourTarget>
        <AutomacoesDoInicio onAvisar={(mensagem, desfazer) => setAviso({ mensagem, desfazer })} />

        <TourTarget id="proximos" style={{ marginHorizontal: 20 }}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                Próximos 7 dias
              </Text>
              <Pressable onPress={() => router.push('/agenda')} accessibilityRole="button" hitSlop={8}>
                <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                  Agenda
                </Text>
              </Pressable>
            </View>
            {proximos.length === 0 ? (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
                Nada vence nos próximos 7 dias.
              </Text>
            ) : (
              proximos.slice(0, 5).map((l) => {
                const parcelaId = l.tipo === 'conta_fixa' ? Number(l.id.replace('parcela-', '')) : null;
                return (
                  <View
                    key={l.id}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                        {l.descricao}
                      </Text>
                      <Text
                        className="font-body"
                        style={{ color: l.status === 'atrasado' ? colors.danger : colors.textMuted, fontSize: 11 }}
                      >
                        {l.status === 'atrasado'
                          ? `Atrasada · venceu ${formatarData(l.data, 'dd/MM')}`
                          : l.data === hoje
                            ? 'Hoje'
                            : formatarData(l.data, "EEE, dd/MM")}
                        {` · ${formatarMoeda(l.valor)}`}
                      </Text>
                    </View>
                    {parcelaId !== null && Number.isFinite(parcelaId) ? (
                      <Pressable
                        onPress={() => marcarPaga(parcelaId)}
                        accessibilityRole="button"
                        accessibilityLabel={`Marcar ${l.descricao} como paga`}
                        style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.brand }}
                      >
                        <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                          Paguei
                        </Text>
                      </Pressable>
                    ) : l.tipo === 'fatura' ? (
                      <Pressable
                        onPress={() => router.push(`/agenda?mes=${l.competencia}&item=fatura-${l.cartaoId}` as Href)}
                        accessibilityRole="button"
                        style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.brand }}
                      >
                        <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                          Pagar
                        </Text>
                      </Pressable>
                    ) : (
                      <Text className="font-body-medium" style={{ color: colors.success, fontSize: 12 }}>
                        entrada
                      </Text>
                    )}
                  </View>
                );
              })
            )}
            {pagamentosDoMes.total > 0 && (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                Falta pagar {formatarMoeda(pagamentosDoMes.totalPendente)} de {formatarMoeda(pagamentosDoMes.total)} este mês
              </Text>
            )}
          </Card>
        </TourTarget>

        <View style={{ height: 12 }} />

        <TourTarget id="saldo" style={{ marginHorizontal: 20 }}>
          <Card style={{ paddingVertical: 4 }}>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, paddingTop: 10 }}>
              Seu dinheiro
            </Text>
            {[
              { rotulo: 'Em contas', detalhe: `${contas.length} ${contas.length === 1 ? 'conta' : 'contas'}`, valor: saldoTotal, href: '/conta-bancaria' as Href, cor: colors.text },
              { rotulo: 'Faturas em aberto', detalhe: `${cartoes.length} ${cartoes.length === 1 ? 'cartão' : 'cartões'}`, valor: faturasEmAberto, href: '/cartoes' as Href, cor: faturasEmAberto > 0 ? colors.danger : colors.text },
              { rotulo: 'Guardado', detalhe: `reserva ${formatarMoeda(reserva?.valorAtual ?? 0)} · ${cofrinhos.length} ${cofrinhos.length === 1 ? 'cofrinho' : 'cofrinhos'}`, valor: (reserva?.valorAtual ?? 0) + valorCofrinhos, href: '/metas' as Href, cor: colors.text },
            ].map((linha, i) => (
              <Pressable
                key={linha.rotulo}
                onPress={() => router.push(linha.href)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
              >
                <View style={{ flex: 1 }}>
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
                    {linha.rotulo}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                    {linha.detalhe}
                  </Text>
                </View>
                <Text className="font-heading-medium" style={{ color: linha.cor, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                  {formatarMoeda(linha.valor)}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
              </Pressable>
            ))}
          </Card>
        </TourTarget>

        <View style={{ height: 12 }} />

        <Pressable onPress={() => router.push('/planejamento')} accessibilityRole="button" style={{ marginHorizontal: 20 }}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                Próximos meses
              </Text>
              <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                Planejamento
              </Text>
            </View>
            <GraficoProjecao projecao={projecao} altura={160} />
          </Card>
        </Pressable>

        <View style={{ height: 16 }} />

        <TourTarget id="acoes-rapidas">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10, marginBottom: 16 }}
          >
            {ACOES_RAPIDAS.map((acao) => (
              <Pressable
                key={acao.rotulo}
                onPress={() => router.push(acao.href)}
                accessibilityRole="button"
                style={{ alignItems: 'center', width: 72 }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 6,
                  }}
                >
                  <Feather name={acao.icon} size={18} color="#FFFFFF" />
                </View>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }} numberOfLines={2}>
                  {acao.rotulo}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </TourTarget>

        <TourTarget id="resumo-mes">
          <Pressable onPress={() => router.push('/relatorios')} style={{ marginHorizontal: 20 }}>
            <Card style={{ borderColor: positivo ? colors.success : colors.danger }}>
              <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 13 }}>
                Resumo do mês · {positivo ? 'positivo' : 'negativo'}
              </Text>
              <Text
                className="font-heading"
                style={{ color: positivo ? colors.success : colors.danger, fontSize: 28, marginTop: 4 }}
              >
                {positivo ? '+' : ''}
                {formatarMoeda(resumoMensal.saldo)}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 16, gap: 24 }}>
                <View>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                    Entrou
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                    {formatarMoeda(resumoMensal.receitas)}
                  </Text>
                </View>
                <View>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                    Saiu (gastos + contas pagas)
                  </Text>
                  <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
                    {formatarMoeda(resumoMensal.despesas)}
                  </Text>
                </View>
              </View>
              {resumoMensal.reservadoParaEsteMes > 0 && (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 12 }}>
                  Inclui {formatarMoeda(resumoMensal.reservadoParaEsteMes)} reservado do mês passado.
                </Text>
              )}
            </Card>
          </Pressable>
        </TourTarget>

        <View style={{ height: 12 }} />

        <TourTarget id="gastos-fixos">
          <Pressable
            onPress={() => (gastosFixos.itens.length > 0 ? setVerFixos((v) => !v) : router.push('/conta-fixa'))}
            style={{ marginHorizontal: 20 }}
            accessibilityRole="button"
            accessibilityLabel={`Compromissos do mês: ${formatarMoeda(gastosFixos.total)}`}
          >
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 13 }}>
                  Compromissos do mês
                </Text>
                <Feather name={verFixos ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </View>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 20, marginTop: 4 }}>
                {formatarMoeda(gastosFixos.total)}
              </Text>
              {gastosFixos.total > 0 ? (
                <>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {[
                      gastosFixos.porTipo.conta_fixa > 0 ? `Contas fixas ${formatarMoeda(gastosFixos.porTipo.conta_fixa)}` : null,
                      gastosFixos.porTipo.parcela > 0 ? `Parcelas ${formatarMoeda(gastosFixos.porTipo.parcela)}` : null,
                      gastosFixos.porTipo.cartao > 0 ? `Compras no cartão ${formatarMoeda(gastosFixos.porTipo.cartao)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {formatarMoeda(gastosFixos.totalPago)} pago · {formatarMoeda(gastosFixos.totalPendente)} pendente
                  </Text>
                </>
              ) : (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  Nenhuma conta fixa, parcela ou compra no cartão neste mês.
                </Text>
              )}
              {verFixos && (
                <View style={{ marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                  {gastosFixos.itens.map((item) => (
                    <Pressable
                      key={item.chave}
                      onPress={() => router.push(item.link as Href)}
                      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}
                      accessibilityRole="link"
                    >
                      <View style={{ flex: 1 }}>
                        <Text className="font-body" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                          {item.nome}
                        </Text>
                        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                          {item.tipo === 'conta_fixa' ? 'Conta fixa' : item.tipo === 'parcela' ? 'Parcela' : 'Compras avulsas no cartão'}
                          {item.paga ? ' · paga' : ''}
                        </Text>
                      </View>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                        {formatarMoeda(item.valor)}
                      </Text>
                      <Feather name="chevron-right" size={14} color={colors.textMuted} />
                    </Pressable>
                  ))}
                  <Pressable onPress={() => router.push('/conta-fixa')} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                      Ver contas fixas
                    </Text>
                  </Pressable>
                </View>
              )}
            </Card>
          </Pressable>
        </TourTarget>

        {gastosPorCategoria.length > 0 && (
          <>
            <View style={{ height: 16 }} />
            <View style={{ paddingHorizontal: 20 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16 }}>
                  Gastos por categoria (mês)
                </Text>
                <Pressable onPress={() => router.push('/relatorios')}>
                  <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                    Ver tudo
                  </Text>
                </Pressable>
              </View>
              <Card>
                {gastosPorCategoria.map((item, index) => (
                  <View
                    key={item.categoriaId ?? 'sem-categoria'}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: item.cor,
                        marginRight: 10,
                      }}
                    />
                    <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                      {item.nome}
                    </Text>
                    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 13 }}>
                      {formatarMoeda(item.total)}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>
          </>
        )}

        <View style={{ height: 16 }} />

        {lancamentos.length === 0 ? (
          <EmptyState
            icon="inbox"
            titulo="Nenhum lançamento ainda"
            descricao="Importe o extrato do seu banco: o app categoriza sozinho e só pergunta o que não souber."
            acao={{ rotulo: 'Importar meu primeiro extrato', onPress: () => router.push('/importar-extrato') }}
          />
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16, marginBottom: 10 }}>
              Últimos lançamentos
            </Text>
            {lancamentos.map((item) => {
              const membro = item.membroId ? membrosPorId.get(item.membroId) : undefined;
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push(
                      item.tipoOrigem === 'movimentacao'
                        ? `/movimentacao/${item.origemId}`
                        : `/gasto-rapido/${item.origemId}`
                    )
                  }
                >
                  <Card style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
                        {item.descricao}
                      </Text>
                      {membro && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <View
                            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: membro.cor }}
                          />
                          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
                            {membro.nome}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      className="font-heading-medium"
                      style={{ color: item.saida ? colors.danger : colors.success, fontSize: 14 }}
                    >
                      {item.saida ? '-' : '+'}
                      {formatarMoeda(item.valor)}
                    </Text>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
      <Snackbar
        mensagem={aviso?.mensagem ?? null}
        acao={aviso?.desfazer ? { rotulo: 'Desfazer', onPress: aviso.desfazer } : undefined}
        onFechar={fecharAviso}
      />
      <TourOverlay />
    </SafeAreaView>
  );
}
