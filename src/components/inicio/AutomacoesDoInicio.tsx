import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { addDays, format } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia, hojeIso, mesAnterior, mesAtualIso } from '@/core/utils/date';
import { repositorios } from '@/domain/repositories';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { useOrcamentosStore } from '@/store/orcamentosStore';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { calcularLivreParaGastar } from '@/domain/usecases/calcularLivreParaGastar';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { progressoDosOrcamentos } from '@/domain/usecases/automacoes/orcamento';
import { detectarAssinaturas } from '@/domain/usecases/automacoes/assinaturas';
import { melhorCartaoParaHoje } from '@/domain/usecases/automacoes/simuladores';
import { primeiroDiaNegativo } from '@/domain/usecases/automacoes/saldoProjetado';
import { gerarInsights, MAXIMO_NO_INICIO, type Insight } from '@/domain/usecases/automacoes/insights';
import { lerDivisao, lerIds, salarioParaDividir, sugerirDivisao } from '@/domain/usecases/automacoes/divisaoSalario';
import { detectarForaDoPadrao } from '@/domain/usecases/importacao/resultadoDaImportacao';
import { calcularLimiteDisponivel } from '@/domain/usecases/calcularLimiteDisponivel';

function lerLista(json: string | null): string[] {
  if (!json) return [];
  try {
    const lista = JSON.parse(json) as unknown;
    return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

type Props = {
  /** Mostra o "Desfazer" depois de guardar a divisão do salário. */
  onAvisar: (mensagem: string, desfazer: (() => void) | null) => void;
};

/**
 * Automações do Início: divisão do salário recebido, aviso do fechamento do mês (dia 1 a 7) e
 * até 3 insights (saldo negativo previsto, orçamento, assinatura que subiu, gasto fora do
 * padrão, melhor cartão para hoje), cada um com "Entendi".
 */
export function AutomacoesDoInicio({ onAvisar }: Props) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, contas, categorias, reserva, carregarTudo } = useDadosFinanceiros();
  const { orcamentos } = useOrcamentosStore();
  const { preferencias, atualizar } = usePreferenciasStore();
  const [verTodos, setVerTodos] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const hoje = hojeIso();
  const mes = mesAtualIso();
  const dispensados = useMemo(() => lerLista(preferencias?.insightsDispensados ?? null), [preferencias?.insightsDispensados]);

  const lancamentos = useMemo(
    () => obterLancamentosDoPeriodo(format(addDays(new Date(), -400), 'yyyy-MM-dd'), format(addDays(new Date(), 60), 'yyyy-MM-dd'), dados, hoje),
    [dados, hoje]
  );

  const insights = useMemo(() => {
    const saldos = new Map(contas.map((c) => [c.id, calcularSaldoConta(c, dados.movimentacoes ?? [], dados.gastos ?? [])]));
    const negativos = primeiroDiaNegativo({ contas, saldos, lancamentos, faturas: dados.faturas ?? [], hoje });
    const { itens: orcamentosDoMes } = progressoDosOrcamentos(orcamentos, categorias, lancamentos, mes);
    const assinaturas = detectarAssinaturas({ lancamentos, contasFixas: dados.contasFixas ?? [], categorias, hoje }).itens;
    const comoLancamento = lancamentos
      .filter((l) => l.natureza === 'despesa' && (l.tipo === 'movimentacao' || l.tipo === 'gasto') && l.data <= hoje)
      .map((l) => ({ id: l.id, descricao: l.descricao, data: l.data, valor: l.valor, categoriaId: l.categoriaId, importacaoId: null }));
    const recentes = comoLancamento.filter((l) => l.data >= format(addDays(new Date(), -30), 'yyyy-MM-dd'));
    const nome = (id: number | null) => categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria';
    const foraDoPadrao = detectarForaDoPadrao(recentes, comoLancamento, nome).map((f) => ({
      ...f,
      percentual: f.media > 0 ? Math.round((f.valor / f.media - 1) * 100) : 0,
    }));
    const limites = new Map(
      (dados.cartoes ?? []).map((c) => [
        c.id,
        calcularLimiteDisponivel(c, dados.comprasParceladas ?? [], dados.parcelas ?? [], dados.gastos ?? [], dados.faturas ?? []),
      ])
    );
    return gerarInsights({
      negativos,
      orcamentos: orcamentosDoMes,
      mes,
      assinaturas,
      foraDoPadrao,
      cartoesHoje: melhorCartaoParaHoje(dados.cartoes ?? [], hoje, limites),
      hoje,
      dispensados,
    });
  }, [contas, dados, lancamentos, hoje, orcamentos, categorias, mes, dispensados]);

  // ---- divisão do salário
  const divisao = useMemo(() => {
    if (!preferencias) return null;
    const salario = salarioParaDividir(dados.movimentacoes ?? [], categorias, lerIds(preferencias.salariosDivididos), hoje);
    if (!salario) return null;
    const cofrinhos = (dados.cofrinhos ?? [])
      .filter((c) => c.status !== 'concluido')
      .map((c) => {
        const guardado = (dados.aportesCofrinho ?? []).filter((a) => a.cofrinhoId === c.id).reduce((s, a) => s + a.valor, 0);
        const falta = Math.max(0, c.valorMeta - guardado);
        const meses = c.dataMeta ? Math.max(1, (Number(c.dataMeta.slice(0, 4)) - Number(hoje.slice(0, 4))) * 12 + Number(c.dataMeta.slice(5, 7)) - Number(hoje.slice(5, 7))) : null;
        return { id: c.id, nome: c.nome, falta, aporteSugerido: meses ? Math.ceil(falta / meses) : null };
      });
    const livre = calcularLivreParaGastar(lancamentos, mes, hoje).livre;
    const sugestao = sugerirDivisao({
      salario: salario.valor,
      config: lerDivisao(preferencias.divisaoSalario),
      reserva: reserva ? { valorAtual: reserva.valorAtual, valorMeta: reserva.valorMeta } : null,
      cofrinhos,
      livreParaGastar: livre,
    });
    return sugestao ? { salario, sugestao, livreDepois: livre - sugestao.total } : null;
  }, [preferencias, dados, categorias, hoje, reserva, lancamentos, mes]);

  async function marcarSalario(id: number) {
    const ids = lerIds(preferencias?.salariosDivididos ?? null);
    await atualizar({ salariosDivididos: JSON.stringify([...ids.filter((x) => x !== id), id].slice(-24)) });
  }

  async function guardar() {
    if (!divisao) return;
    setGuardando(true);
    try {
      const repos = repositorios();
      const criados: { reserva: number | null; aportes: number[] } = { reserva: null, aportes: [] };
      await repos.manutencao.emTransacao(async () => {
        if (divisao.sugestao.reserva > 0) criados.reserva = await repos.movimentacoesReserva.registrarAporte(divisao.sugestao.reserva, hoje);
        for (const c of divisao.sugestao.cofrinhos) {
          const aporte = await repos.aportesCofrinho.criarAporte(c.cofrinhoId, c.valor, hoje);
          criados.aportes.push(aporte.id);
        }
      });
      await marcarSalario(divisao.salario.id);
      carregarTudo();
      const salarioId = divisao.salario.id;
      onAvisar(`${formatarMoeda(divisao.sugestao.total)} guardados`, () => {
        void (async () => {
          await repos.manutencao.emTransacao(async () => {
            if (criados.reserva !== null) await repos.movimentacoesReserva.excluirMovimentacaoReserva(criados.reserva);
            for (const id of criados.aportes) await repos.aportesCofrinho.excluirAporte(id);
          });
          const ids = lerIds((await repos.preferencias.buscarPreferencias()).salariosDivididos);
          await atualizar({ salariosDivididos: JSON.stringify(ids.filter((x) => x !== salarioId)) });
          carregarTudo();
        })();
      });
    } finally {
      setGuardando(false);
    }
  }

  async function dispensar(insight: Insight | string) {
    const chave = typeof insight === 'string' ? insight : insight.chave;
    await atualizar({ insightsDispensados: JSON.stringify([...dispensados.filter((d) => d !== chave), chave].slice(-200)) });
  }

  const mesQueFechou = mesAnterior(mes);
  const chaveFechamento = `fechamento-${mesQueFechou}`;
  const mostrarFechamento = Number(hoje.slice(8, 10)) <= 7 && !dispensados.includes(chaveFechamento);
  const visiveis = verTodos ? insights : insights.slice(0, MAXIMO_NO_INICIO);
  const nomeDoMesQueFechou = formatarMesReferencia(mesQueFechou).split(' ')[0].replace(/^./, (c) => c.toUpperCase());

  if (!divisao && !mostrarFechamento && insights.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 20, gap: 10, marginBottom: 12 }}>
      {divisao && (
        <Card style={{ borderColor: colors.brand }}>
          <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15 }}>
            Salário recebido: {formatarMoeda(divisao.salario.valor)}
          </Text>
          <Text className="font-body" style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>
            {'Sugestão: '}
            {[
              divisao.sugestao.reserva > 0 ? `${formatarMoeda(divisao.sugestao.reserva)} para a reserva (${divisao.sugestao.reservaPct}%)` : null,
              ...divisao.sugestao.cofrinhos.map((c) => `${formatarMoeda(c.valor)} para ${c.nome}`),
            ]
              .filter(Boolean)
              .join(' e ')}
            {`. Livre para gastar fica em ${formatarMoeda(divisao.livreDepois)}.`}
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            <Button titulo={`Guardar ${formatarMoeda(divisao.sugestao.total)}`} onPress={guardar} carregando={guardando} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button titulo="Ajustar" variante="secundaria" onPress={() => router.push('/configuracoes/divisao-salario')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button titulo="Agora não" variante="secundaria" onPress={() => marcarSalario(divisao.salario.id)} />
              </View>
            </View>
          </View>
        </Card>
      )}

      {mostrarFechamento && (
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.push('/fechamento-mes')} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
            <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
              {nomeDoMesQueFechou} fechou · Ver fechamento
            </Text>
          </Pressable>
          <Pressable onPress={() => dispensar(chaveFechamento)} hitSlop={10} accessibilityLabel="Dispensar" style={{ padding: 6 }}>
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        </Card>
      )}

      {visiveis.map((insight) => (
        <Card
          key={insight.chave}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderColor: insight.tom === 'alerta' ? colors.danger : insight.tom === 'atencao' ? colors.warning : colors.border,
          }}
        >
          <Feather
            name={insight.tom === 'info' ? 'info' : 'alert-circle'}
            size={18}
            color={insight.tom === 'alerta' ? colors.danger : insight.tom === 'atencao' ? colors.warning : colors.brand}
            style={{ marginRight: 10 }}
          />
          <Pressable onPress={() => router.push(insight.url as Href)} style={{ flex: 1 }} accessibilityRole="button">
            <Text className="font-body" style={{ color: colors.text, fontSize: 13 }}>
              {insight.texto}
            </Text>
          </Pressable>
          <Pressable onPress={() => dispensar(insight)} hitSlop={8} accessibilityRole="button" style={{ marginLeft: 8, minHeight: 32, justifyContent: 'center' }}>
            <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
              Entendi
            </Text>
          </Pressable>
        </Card>
      ))}
      {insights.length > MAXIMO_NO_INICIO && (
        <Pressable onPress={() => setVerTodos((v) => !v)} style={{ minHeight: 36, justifyContent: 'center' }} accessibilityRole="button">
          <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
            {verTodos ? 'Mostrar menos' : `Ver todos (${insights.length})`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
