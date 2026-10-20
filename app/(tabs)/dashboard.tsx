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
import { useOrcamentosStore } from '@/store/orcamentosStore';
import { usePerguntasStore } from '@/store/perguntasStore';
import { EmptyState } from '@/components/EmptyState';
import { FabButton } from '@/components/FabButton';
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
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import { hojeIso, mesAnterior, mesAtualIso } from '@/core/utils/date';

const MES_ATUAL = mesAtualIso();

type AcaoRapida = { icon: React.ComponentProps<typeof Feather>['name']; rotulo: string; href: Href };

const ACOES_RAPIDAS: AcaoRapida[] = [
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
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { faturas, carregar: carregarFaturas } = useFaturasStore();
  const { compras, carregar: carregarCompras } = useComprasParceladasStore();
  const { perguntas, carregar: carregarPerguntas } = usePerguntasStore();
  const { carregar: carregarOrcamentos } = useOrcamentosStore();
  const [aviso, setAviso] = useState<{ mensagem: string; desfazer: (() => void) | null } | null>(null);
  const fecharAviso = useCallback(() => setAviso(null), []);

  const [membroSelecionadoId, setMembroSelecionadoId] = useState<number | null>(null);

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
          <ScreenHeader title="Cofre" subtitle="Seu dinheiro, sob controle" />
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
                <Text
                  className="font-body"
                  style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}
                  numberOfLines={2}
                >
                  {acao.rotulo}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </TourTarget>

        <AvisoPendencias quantidade={perguntas.length} />
        <AutomacoesDoInicio onAvisar={(mensagem, desfazer) => setAviso({ mensagem, desfazer })} />

        <TourTarget id="saldo">
          <Pressable onPress={() => router.push('/conta-bancaria')} style={{ marginHorizontal: 20 }}>
            <Card style={{ backgroundColor: colors.brand, borderWidth: 0 }}>
              <Text className="font-body-medium" style={{ color: '#E9F3EC', fontSize: 13 }}>
                Saldo em contas
              </Text>
              <Text className="font-heading" style={{ color: '#FFFFFF', fontSize: 34, marginTop: 4 }}>
                {formatarMoeda(saldoTotal)}
              </Text>
              <Text className="font-body" style={{ color: '#CFE3D6', fontSize: 11, marginTop: 2 }}>
                {contas.length} conta{contas.length === 1 ? '' : 's'} bancária{contas.length === 1 ? '' : 's'} ativa
                {contas.length === 1 ? '' : 's'}
              </Text>
            </Card>
          </Pressable>
        </TourTarget>

        <View style={{ height: 12 }} />

        <Card style={{ marginHorizontal: 20 }}>
          <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 13 }}>
            Livre para gastar até o fim do mês
          </Text>
          <Text
            className="font-heading"
            style={{ color: livre.livre < 0 ? colors.danger : colors.text, fontSize: 28, marginTop: 4 }}
          >
            {formatarMoeda(livre.livre)}
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {livre.porDia > 0
              ? `${formatarMoeda(livre.porDia)} por dia nos próximos ${livre.diasRestantes} ${livre.diasRestantes === 1 ? 'dia' : 'dias'}`
              : livre.livre < 0
                ? 'As saídas previstas do mês já passam das entradas.'
                : 'Nada livre até o fim do mês.'}
          </Text>
          <View style={{ marginTop: 12, gap: 4 }}>
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
                <Text className="font-body-medium" style={{ color: colors.text, fontSize: 12 }}>
                  {linha.sinal} {formatarMoeda(linha.valor)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={{ height: 12 }} />

        <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 20 }}>
          <Pressable onPress={() => router.push('/reserva-emergencia')} style={{ flex: 1 }}>
            <Card>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                Reservado
              </Text>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16, marginTop: 2 }}>
                {formatarMoeda(reserva?.valorAtual ?? 0)}
              </Text>
            </Card>
          </Pressable>
          <Pressable onPress={() => router.push('/cofrinho')} style={{ flex: 1 }}>
            <Card>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                Cofrinhos ({cofrinhos.length})
              </Text>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16, marginTop: 2 }}>
                {formatarMoeda(valorCofrinhos)}
              </Text>
            </Card>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />

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
          <Pressable onPress={() => router.push('/conta-fixa')} style={{ marginHorizontal: 20 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 13 }}>
                  Gastos fixos do mês (inclui cartão)
                </Text>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </View>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 20, marginTop: 4 }}>
                {formatarMoeda(gastosFixos.total)}
              </Text>
              {gastosFixos.total > 0 ? (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {formatarMoeda(gastosFixos.totalPago)} pago · {formatarMoeda(gastosFixos.totalPendente)} pendente
                </Text>
              ) : (
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  Nenhuma conta fixa, parcela ou compra no cartão neste mês.
                </Text>
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
            descricao="Cadastre uma conta bancária e comece a registrar suas movimentações para ver o dashboard completo aqui."
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
      <FabButton tourId="fab" />
      <Snackbar
        mensagem={aviso?.mensagem ?? null}
        acao={aviso?.desfazer ? { rotulo: 'Desfazer', onPress: aviso.desfazer } : undefined}
        onFechar={fecharAviso}
      />
      <TourOverlay />
    </SafeAreaView>
  );
}
