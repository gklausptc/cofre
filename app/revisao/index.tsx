import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { RespostaDaPergunta } from '@/components/importacao/RespostaDaPergunta';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import { dadosDaPergunta, usePerguntasStore } from '@/store/perguntasStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useImportacoesStore } from '@/store/importacoesStore';
import type { RespostaPergunta } from '@/domain/usecases/importacao/responderPergunta';
import type { DadosDaPergunta } from '@/domain/types/perguntas';

function exemploDa(dados: DadosDaPergunta): string | null {
  if (dados.tipo === 'categoria' || dados.tipo === 'pix_pessoa') return dados.exemplo;
  if (dados.tipo === 'duplicidade') return dados.linha.descricao;
  if (dados.tipo === 'parcelamento') return dados.descricao;
  return null;
}

function valorDa(dados: DadosDaPergunta): number | null {
  if (dados.tipo === 'duplicidade') return dados.linha.valor;
  if (dados.tipo === 'parcelamento') return dados.valorParcela;
  if (dados.tipo === 'recorrencia') return dados.valor;
  return null;
}

/** A IA pergunta: um card por dúvida da importação, com a pista do porquê, até acabar a fila. */
export default function RevisaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { perguntas, carregar, responder } = usePerguntasStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { importacoes, carregar: carregarImportacoes } = useImportacoesStore();

  // puladas nesta visita vão para o fim da fila; respondidas contam no progresso
  const [puladas, setPuladas] = useState<number[]>([]);
  const [respondidas, setRespondidas] = useState(0);
  const [resposta, setResposta] = useState<RespostaPergunta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarCategorias();
      carregarContas();
      carregarMembros();
      carregarImportacoes();
    }, [carregar, carregarCategorias, carregarContas, carregarMembros, carregarImportacoes])
  );

  const fila = useMemo(() => {
    const naoPuladas = perguntas.filter((p) => !puladas.includes(p.id));
    const depois = puladas.map((id) => perguntas.find((p) => p.id === id)).filter((p) => p !== undefined);
    return [...naoPuladas, ...depois];
  }, [perguntas, puladas]);

  const atual = fila[0] ?? null;
  const dados = atual ? dadosDaPergunta(atual) : null;
  const total = respondidas + fila.length;
  const contaDasLinhas = atual?.importacaoId != null ? (importacoes.find((i) => i.id === atual.importacaoId)?.contaBancariaId ?? null) : null;
  const aoResponder = useCallback((r: RespostaPergunta | null) => setResposta(r), []);

  function pular() {
    if (!atual) return;
    setResposta(null);
    setPuladas((lista) => [...lista.filter((id) => id !== atual.id), atual.id]);
  }

  async function confirmar() {
    if (!atual || !resposta) return;
    setSalvando(true);
    setErro(null);
    try {
      await responder(atual, resposta);
      setRespondidas((n) => n + 1);
      setPuladas((lista) => lista.filter((id) => id !== atual.id));
      setResposta(null);
    } catch {
      setErro('Não consegui salvar a resposta. Nada foi alterado; tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Revisão" subtitle="O que a importação não soube resolver sozinha" />

        {!atual || !dados ? (
          <View style={{ gap: 12 }}>
            <EmptyState
              icon="check-circle"
              titulo={respondidas > 0 ? 'Tudo respondido' : 'Nada para revisar'}
              descricao={
                respondidas > 0
                  ? `${respondidas} ${respondidas === 1 ? 'resposta salva' : 'respostas salvas'}. As próximas importações já usam o que você ensinou.`
                  : 'Quando uma importação tiver dúvidas, elas aparecem aqui.'
              }
            />
            <View style={{ paddingHorizontal: 20 }}>
              <Button titulo="Voltar ao início" onPress={() => router.replace('/dashboard')} />
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: total, now: respondidas }}
              style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginBottom: 6, overflow: 'hidden' }}
            >
              <View style={{ width: `${total === 0 ? 0 : (respondidas / total) * 100}%`, height: 6, backgroundColor: colors.brand }} />
            </View>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
              {fila.length} {fila.length === 1 ? 'pergunta' : 'perguntas'} na fila
            </Text>

            <Card key={atual.id}>
              <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 17 }}>
                {atual.titulo}
              </Text>
              {exemploDa(dados) && (
                <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, marginTop: 8 }}>
                  {exemploDa(dados)}
                  {valorDa(dados) !== null ? ` · ${formatarMoeda(valorDa(dados) ?? 0)}` : ''}
                </Text>
              )}
              <Text className="font-body" style={{ color: colors.warning, fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                {atual.pista}
              </Text>
              <RespostaDaPergunta
                key={atual.id}
                dados={dados}
                categorias={categorias}
                contas={contas}
                membros={membros}
                contaDasLinhas={contaDasLinhas}
                onResposta={aoResponder}
              />
              {erro && (
                <Text className="font-body" style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>
                  {erro}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button titulo="Pular" variante="secundaria" onPress={pular} disabled={salvando} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button titulo="Confirmar" onPress={confirmar} disabled={!resposta} carregando={salvando} />
                </View>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
