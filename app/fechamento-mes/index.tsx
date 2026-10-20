import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { addDays, format } from 'date-fns';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { MonthSelector } from '@/components/MonthSelector';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarMesReferencia, hojeIso, mesAnterior, mesAtualIso, mesSeguinte } from '@/core/utils/date';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { useOrcamentosStore } from '@/store/orcamentosStore';
import { usePerguntasStore } from '@/store/perguntasStore';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { calcularSaldoTotal } from '@/domain/usecases/calcularSaldoConta';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import { montarFechamentoDoMes } from '@/domain/usecases/automacoes/fechamentoDoMes';
import { detectarAssinaturas } from '@/domain/usecases/automacoes/assinaturas';
import { orcamentoDoMes, sugerirOrcamentos } from '@/domain/usecases/automacoes/orcamento';

const nomeDoMes = (mes: string) => formatarMesReferencia(mes).split(' ')[0];
const maiuscula = (texto: string) => texto.replace(/^./, (c) => c.toUpperCase());

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 8 }}>
        {titulo}
      </Text>
      {children}
    </Card>
  );
}

function Linha({ texto, valor, cor }: { texto: string; valor?: string; cor?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text className="font-body" style={{ color: colors.text, fontSize: 13, flex: 1 }}>
        {texto}
      </Text>
      {valor !== undefined && (
        <Text className="font-heading-medium" style={{ color: cor ?? colors.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>
          {valor}
        </Text>
      )}
    </View>
  );
}

/** Fechamento do mês que terminou: como foi, o que deu certo, o que passou, e o próximo mês. */
export default function FechamentoDoMesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, contas, categorias, carregarTudo } = useDadosFinanceiros();
  const { orcamentos, carregar: carregarOrcamentos, definirVarios } = useOrcamentosStore();
  const { perguntas, carregar: carregarPerguntas } = usePerguntasStore();
  // no dia 1º, o fechamento é do mês que acabou de terminar
  const [mes, setMes] = useState(mesAnterior(mesAtualIso()));
  const [aceito, setAceito] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
      carregarOrcamentos();
      carregarPerguntas();
    }, [carregarTudo, carregarOrcamentos, carregarPerguntas])
  );

  const hoje = hojeIso();
  const lancamentos = useMemo(
    () => obterLancamentosDoPeriodo(format(addDays(new Date(), -400), 'yyyy-MM-dd'), format(addDays(new Date(), 60), 'yyyy-MM-dd'), dados, hoje),
    [dados, hoje]
  );
  const fechamento = useMemo(() => montarFechamentoDoMes({ mes, lancamentos, orcamentos, categorias }), [mes, lancamentos, orcamentos, categorias]);
  const assinaturas = useMemo(
    () => detectarAssinaturas({ lancamentos, contasFixas: dados.contasFixas ?? [], categorias, hoje: dataNoMes(mes, 31) }),
    [lancamentos, dados.contasFixas, categorias, mes]
  );
  const proximo = mesSeguinte(mes);
  const sugestoes = useMemo(
    () => sugerirOrcamentos(lancamentos, categorias, proximo).filter((s) => (orcamentoDoMes(orcamentos, s.categoriaId, proximo) ?? 0) <= 0),
    [lancamentos, categorias, proximo, orcamentos]
  );
  const saldoContas = calcularSaldoTotal(contas, dados.movimentacoes ?? [], dados.gastos ?? []);
  const faturasEmAberto = lancamentos.filter((l) => l.natureza === 'fatura' && l.status !== 'pago').reduce((s, l) => s + l.valor, 0);
  const atrasadas = lancamentos.filter((l) => l.status === 'atrasado').length;

  const { numeros, anterior } = fechamento;
  const diferenca = numeros.sobra - anterior.sobra;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title={`Fechamento de ${nomeDoMes(mes)}`} subtitle="Como foi o mês e o que fazer no próximo" />
        <MonthSelector mesReferencia={mes} onAnterior={() => setMes(mesAnterior(mes))} onProximo={() => setMes(mesSeguinte(mes))} />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Card>
            <Text className="font-heading" style={{ color: numeros.sobra >= 0 ? colors.success : colors.danger, fontSize: 20 }}>
              {maiuscula(nomeDoMes(mes))} fechou com {numeros.sobra >= 0 ? 'sobra' : 'falta'} de {formatarMoeda(Math.abs(numeros.sobra))}
            </Text>
            {(anterior.receitas > 0 || anterior.despesas > 0) && (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
                {diferenca === 0
                  ? `Igual a ${nomeDoMes(mesAnterior(mes))}.`
                  : `${formatarMoeda(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais' : 'a menos'} que ${nomeDoMes(mesAnterior(mes))}.`}
              </Text>
            )}
            <View style={{ marginTop: 10 }}>
              <Linha texto="Entradas" valor={formatarMoeda(numeros.receitas)} cor={colors.success} />
              <Linha texto="Gastos" valor={formatarMoeda(numeros.despesas)} cor={colors.danger} />
              <Linha texto="Guardado" valor={formatarMoeda(numeros.guardado)} />
            </View>
          </Card>

          <Bloco titulo="O que deu certo">
            {fechamento.deuCerto.length === 0 && fechamento.contasPagas.total === 0 ? (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                Com orçamento ou alguns meses de histórico, as categorias que ficaram abaixo aparecem aqui.
              </Text>
            ) : (
              <>
                {fechamento.contasPagas.total > 0 && (
                  <Linha texto={`${fechamento.contasPagas.pagas} de ${fechamento.contasPagas.total} contas fixas pagas`} />
                )}
                {fechamento.deuCerto.slice(0, 5).map((c) => (
                  <Linha
                    key={String(c.categoriaId)}
                    texto={`${c.nome}: ${formatarMoeda(c.gasto)}, ${c.motivo} (${formatarMoeda(c.referencia)})`}
                  />
                ))}
              </>
            )}
          </Bloco>

          {fechamento.acimaDoOrcamento.length > 0 && (
            <Bloco titulo="Acima do orçamento">
              {fechamento.acimaDoOrcamento.map((o) => (
                <Linha key={o.categoriaId} texto={o.nome} valor={`${formatarMoeda(o.gasto)} de ${formatarMoeda(o.limite)}`} cor={colors.danger} />
              ))}
              <View style={{ marginTop: 8 }}>
                <Button titulo="Ver orçamento" variante="secundaria" onPress={() => router.push('/orcamento')} />
              </View>
            </Bloco>
          )}

          {assinaturas.itens.length > 0 && (
            <Bloco titulo="Assinaturas">
              <Linha texto={`${assinaturas.itens.length} ${assinaturas.itens.length === 1 ? 'assinatura' : 'assinaturas'} por mês`} valor={formatarMoeda(assinaturas.totalMensal)} />
              {assinaturas.itens
                .filter((a) => a.aumento)
                .map((a) => (
                  <Linha key={a.chave} texto={`${a.nome} subiu ${a.aumento?.percentual}%`} valor={formatarMoeda(a.valorMensal)} cor={colors.warning} />
                ))}
            </Bloco>
          )}

          <Bloco titulo="Guardado no mês">
            <Linha texto="Reserva de emergência" valor={formatarMoeda(fechamento.guardado.reserva)} />
            <Linha texto="Cofrinhos" valor={formatarMoeda(fechamento.guardado.cofrinhos)} />
          </Bloco>

          <Bloco titulo={`O que passou para ${nomeDoMes(proximo)}`}>
            <Linha texto="Em contas hoje" valor={formatarMoeda(saldoContas)} />
            <Linha texto="Faturas em aberto" valor={formatarMoeda(faturasEmAberto)} cor={faturasEmAberto > 0 ? colors.danger : undefined} />
            <Linha texto="Sobra depois das faturas" valor={formatarMoeda(saldoContas - faturasEmAberto)} />
          </Bloco>

          <Bloco titulo={maiuscula(nomeDoMes(proximo))}>
            {sugestoes.length > 0 && !aceito ? (
              <>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
                  {sugestoes.length} {sugestoes.length === 1 ? 'categoria' : 'categorias'} sem orçamento, com sugestão pela média de 3 meses.
                </Text>
                <Button
                  titulo={`Aceitar orçamento sugerido para ${nomeDoMes(proximo)}`}
                  onPress={async () => {
                    await definirVarios(sugestoes.map((s) => ({ categoriaId: s.categoriaId, mesInicio: proximo, limite: s.sugestao, apenasNoMes: false })));
                    setAceito(true);
                  }}
                />
              </>
            ) : (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                {aceito ? 'Orçamento definido.' : 'Orçamento em dia.'}
              </Text>
            )}
            {(perguntas.length > 0 || atrasadas > 0) && (
              <View style={{ marginTop: 10, gap: 8 }}>
                {perguntas.length > 0 && (
                  <Button titulo={`Responder ${perguntas.length} ${perguntas.length === 1 ? 'pergunta' : 'perguntas'} da importação`} variante="secundaria" onPress={() => router.push('/revisao')} />
                )}
                {atrasadas > 0 && (
                  <Button titulo={`${atrasadas} ${atrasadas === 1 ? 'conta atrasada' : 'contas atrasadas'}`} variante="secundaria" onPress={() => router.push('/pagamentos')} />
                )}
              </View>
            )}
          </Bloco>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
