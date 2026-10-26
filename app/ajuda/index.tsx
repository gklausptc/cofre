import React, { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { addDays, format } from 'date-fns';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { hojeIso, mesAtualIso } from '@/core/utils/date';
import { useDadosFinanceiros } from '@/store/useDadosFinanceiros';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { obterLancamentosDoPeriodo } from '@/domain/usecases/obterLancamentosDoPeriodo';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { calcularLivreParaGastar, calcularSobraDoMesAnterior } from '@/domain/usecases/calcularLivreParaGastar';
import { responderNoAssistente, type AcaoDoAssistente } from '@/domain/usecases/ajuda/assistente';
import { SUGESTOES_DO_ASSISTENTE } from '@/domain/dados/ajuda';

type Mensagem = { id: number; de: 'voce' | 'app'; texto: string; acoes: AcaoDoAssistente[] };

const BOAS_VINDAS: Mensagem = {
  id: 0,
  de: 'app',
  texto:
    'Oi! Pergunte sobre os seus números ("quanto gastei com mercado este mês?", "qual meu saldo?") ou sobre como usar o app. Não uso internet nem IA: as respostas saem dos seus dados, aqui no aparelho.',
  acoes: [],
};

/** Ajuda: um assistente sem IA (perguntas sobre os seus números e sobre o app) e o tour de novo. */
export default function AjudaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { dados, contas, categorias, carregarTudo } = useDadosFinanceiros();
  const { atualizar: atualizarPreferencias } = usePreferenciasStore();
  const [mensagens, setMensagens] = useState<Mensagem[]>([BOAS_VINDAS]);
  const [texto, setTexto] = useState('');
  const rolagem = useRef<ScrollViewInstance>(null);

  useFocusEffect(
    useCallback(() => {
      carregarTudo();
    }, [carregarTudo])
  );

  const contexto = useMemo(() => {
    const hoje = hojeIso();
    const lancamentos = obterLancamentosDoPeriodo(
      format(addDays(new Date(), -400), 'yyyy-MM-dd'),
      format(addDays(new Date(), 60), 'yyyy-MM-dd'),
      dados,
      hoje
    );
    return {
      hoje,
      lancamentos,
      categorias,
      cartoes: dados.cartoes ?? [],
      contas: contas
        .filter((c) => c.ativo !== false)
        .map((c) => ({ id: c.id, nome: c.nomeConta, saldo: calcularSaldoConta(c, dados.movimentacoes ?? [], dados.gastos ?? []) })),
      livre: calcularLivreParaGastar(
        lancamentos,
        mesAtualIso(),
        hoje,
        calcularSobraDoMesAnterior(mesAtualIso(), {
          contas: contas.filter((c) => c.ativo !== false),
          movimentacoes: dados.movimentacoes ?? [],
          gastos: dados.gastos ?? [],
          aportesCofrinho: dados.aportesCofrinho,
          movimentacoesReserva: dados.movimentacoesReserva,
        })
      ),
    };
  }, [dados, contas, categorias]);

  function perguntar(pergunta: string) {
    const limpa = pergunta.trim();
    if (limpa === '') return;
    const resposta = responderNoAssistente(limpa, contexto);
    setMensagens((atuais) => [
      ...atuais,
      { id: atuais.length, de: 'voce', texto: limpa, acoes: [] },
      { id: atuais.length + 1, de: 'app', texto: resposta.texto, acoes: resposta.acoes },
    ]);
    setTexto('');
    setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 50);
  }

  async function verTour() {
    await atualizarPreferencias({ tutorialConcluido: false });
    router.replace('/dashboard');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={rolagem} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {mensagens.map((m) => (
            <View key={m.id} style={{ alignItems: m.de === 'voce' ? 'flex-end' : 'flex-start' }}>
              <View
                style={{
                  maxWidth: '88%',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 16,
                  borderBottomRightRadius: m.de === 'voce' ? 4 : 16,
                  borderBottomLeftRadius: m.de === 'app' ? 4 : 16,
                  backgroundColor: m.de === 'voce' ? colors.brand : colors.card,
                  borderWidth: m.de === 'app' ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <Text className="font-body" style={{ color: m.de === 'voce' ? '#FFFFFF' : colors.text, fontSize: 14, lineHeight: 20 }}>
                  {m.texto}
                </Text>
                {m.acoes.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {m.acoes.map((a) => (
                      <Pressable
                        key={a.href}
                        onPress={() => router.push(a.href as Href)}
                        accessibilityRole="button"
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.brand, minHeight: 34, justifyContent: 'center' }}
                      >
                        <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 12 }}>
                          {a.rotulo}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}

          {mensagens.length <= 3 && (
            <View style={{ marginTop: 6 }}>
              <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                Experimente
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SUGESTOES_DO_ASSISTENTE.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => perguntar(s)}
                    accessibilityRole="button"
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
                  >
                    <Text className="font-body" style={{ color: colors.text, fontSize: 13 }}>
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={verTour}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, minHeight: 44 }}
              >
                <Feather name="play-circle" size={18} color={colors.brand} style={{ marginRight: 8 }} />
                <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 14 }}>
                  Ver o tour do Início de novo
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Pergunte algo…"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={() => perguntar(texto)}
            returnKeyType="send"
            style={{
              flex: 1,
              minHeight: 44,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 22,
              paddingHorizontal: 16,
              color: colors.text,
              fontSize: 15,
            }}
          />
          <Pressable
            onPress={() => perguntar(texto)}
            disabled={texto.trim() === ''}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', opacity: texto.trim() === '' ? 0.5 : 1 }}
          >
            <Feather name="send" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
