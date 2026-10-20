import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ProgressCard } from '@/components/ProgressCard';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { useReservaEmergenciaStore } from '@/store/reservaEmergenciaStore';
import { useCofrinhosStore } from '@/store/cofrinhosStore';
import { useAportesCofrinhoStore } from '@/store/aportesCofrinhoStore';
import { legendaDoCofrinho, resumirMetasFinanceiras } from '@/domain/usecases/resumirMetasFinanceiras';
import { descreverRendimento, type ConfigRendimento } from '@/domain/usecases/rendimento';
import { useOrcamentosStore } from '@/store/orcamentosStore';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { progressoDosOrcamentos } from '@/domain/usecases/automacoes/orcamento';
import { dataNoMes } from '@/domain/usecases/mesDaFatura';
import { hojeIso, mesAnterior, mesAtualIso } from '@/core/utils/date';

/** "Previsão: 3 meses · rende 105% do CDI" */
function juntarLegenda(...partes: (string | undefined)[]): string | undefined {
  const texto = partes.filter((p): p is string => Boolean(p)).join(' · ');
  return texto || undefined;
}

const rendeEm = (config: ConfigRendimento) =>
  config.indexador === 'nenhum' ? undefined : `rende ${descreverRendimento(config)}`;

function TituloSecao({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16, marginTop: 8 }}>
      {children}
    </Text>
  );
}

export default function MetasFinanceirasScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { reserva, carregar: carregarReserva } = useReservaEmergenciaStore();
  const { cofrinhos, carregar: carregarCofrinhos } = useCofrinhosStore();
  const { aportes, carregar: carregarAportes } = useAportesCofrinhoStore();
  const { orcamentos, carregar: carregarOrcamentos } = useOrcamentosStore();
  const { dados, categorias, carregarTudo } = useDadosFinanceiros();

  useFocusEffect(
    useCallback(() => {
      carregarReserva();
      carregarCofrinhos();
      carregarAportes();
      carregarOrcamentos();
      carregarTudo();
    }, [carregarReserva, carregarCofrinhos, carregarAportes, carregarOrcamentos, carregarTudo])
  );

  const mes = mesAtualIso();
  const orcamentoDoMes = useMemo(() => {
    const lancamentos = obterLancamentosDoPeriodo(`${mesAnterior(mesAnterior(mes))}-01`, dataNoMes(mes, 31), dados, hojeIso());
    return progressoDosOrcamentos(orcamentos, categorias, lancamentos, mes);
  }, [orcamentos, categorias, dados, mes]);

  const resumo = useMemo(() => resumirMetasFinanceiras(reserva, cofrinhos, aportes), [reserva, cofrinhos, aportes]);
  const temMetas = resumo.totalDasMetas > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Metas" subtitle="Reserva, cofrinhos e orçamento do mês" />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {temMetas && (
            <ProgressCard
              titulo="Total guardado"
              cor={colors.brand}
              valorAtual={resumo.totalGuardado}
              valorMeta={resumo.totalDasMetas}
              percentual={Math.min(resumo.totalGuardado / resumo.totalDasMetas, 1)}
              legenda="Somando a reserva de emergência e todos os cofrinhos"
            />
          )}

          <TituloSecao>Reserva de emergência</TituloSecao>
          {resumo.reserva ? (
            <Pressable onPress={() => router.push('/reserva-emergencia')}>
              <ProgressCard
                titulo="Reserva de emergência"
                cor={colors.brand}
                valorAtual={resumo.reserva.valorAtual}
                valorMeta={resumo.reserva.valorMeta}
                percentual={resumo.reserva.percentual}
                legenda={juntarLegenda(
                  resumo.reserva.mesesCobertura ? `Meta para ${resumo.reserva.mesesCobertura} meses de cobertura` : undefined,
                  reserva ? rendeEm(reserva) : undefined
                )}
              />
            </Pressable>
          ) : (
            <Card>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
                Sua rede de segurança para imprevistos. O ideal é guardar de 3 a 6 meses do seu custo fixo.
              </Text>
              <Button titulo="Definir meta da reserva" onPress={() => router.push('/reserva-emergencia')} />
            </Card>
          )}

          <TituloSecao>Cofrinhos</TituloSecao>
          {resumo.cofrinhos.length === 0 ? (
            <View style={{ marginHorizontal: -20 }}>
              <EmptyState
                icon="gift"
                titulo="Nenhum cofrinho"
                descricao="Crie um cofrinho para juntar dinheiro para uma viagem, compra ou objetivo."
                acao={{ rotulo: 'Criar cofrinho', onPress: () => router.push('/cofrinho/novo') }}
              />
            </View>
          ) : (
            resumo.cofrinhos.map(({ cofrinho, progresso }) => (
              <Pressable key={cofrinho.id} onPress={() => router.push(`/cofrinho/${cofrinho.id}`)}>
                <ProgressCard
                  titulo={cofrinho.nome}
                  cor={cofrinho.cor}
                  valorAtual={progresso.valorAtual}
                  valorMeta={cofrinho.valorMeta}
                  percentual={progresso.percentual}
                  legenda={juntarLegenda(legendaDoCofrinho(cofrinho, progresso), rendeEm(cofrinho))}
                />
              </Pressable>
            ))
          )}
          <Button titulo="Novo cofrinho" variante="secundaria" onPress={() => router.push('/cofrinho/novo')} />

          <TituloSecao>Orçamento do mês</TituloSecao>
          <Card>
            {orcamentoDoMes.itens.length === 0 ? (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
                Defina quanto cada categoria pode gastar. Com um mês de lançamentos, o app sugere os limites pela média.
              </Text>
            ) : (
              <>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Orçado {formatarMoeda(orcamentoDoMes.orcado)} · Gasto {formatarMoeda(orcamentoDoMes.gasto)}
                </Text>
                {orcamentoDoMes.itens.slice(0, 3).map((item) => {
                  const cor = item.situacao === 'estourado' ? colors.danger : item.situacao === 'atencao' ? colors.warning : item.cor;
                  return (
                    <View key={item.categoriaId} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
                          {item.nome}
                        </Text>
                        <Text className="font-body" style={{ color: cor, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                          {formatarMoeda(item.gasto)} de {formatarMoeda(item.limite)}
                        </Text>
                      </View>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                        <View style={{ width: `${Math.min(1, item.proporcao) * 100}%`, height: 6, backgroundColor: cor }} />
                      </View>
                    </View>
                  );
                })}
              </>
            )}
            <Button
              titulo={orcamentoDoMes.itens.length === 0 ? 'Definir orçamento' : 'Ver orçamento completo'}
              variante="secundaria"
              onPress={() => router.push('/orcamento')}
            />
          </Card>
          <Pressable onPress={() => router.push('/assinaturas')} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                Assinaturas
              </Text>
              <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
                Ver
              </Text>
            </Card>
          </Pressable>

          {temMetas && (
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
              Faltam {formatarMoeda(Math.max(resumo.totalDasMetas - resumo.totalGuardado, 0))} para completar todas as
              metas.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
