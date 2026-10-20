import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ColorPicker } from '@/components/ColorPicker';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ProgressCard } from '@/components/ProgressCard';
import { DateField } from '@/components/DateField';
import { ConfigRendimentoForm } from '@/components/ConfigRendimentoForm';
import { PainelRendimento } from '@/components/PainelRendimento';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import type { ConfigRendimento } from '@/domain/usecases/rendimento';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCofrinhosStore } from '@/store/cofrinhosStore';
import { useAportesCofrinhoStore } from '@/store/aportesCofrinhoStore';
import { calcularProgressoCofrinho } from '@/domain/usecases/calcularProgressoCofrinho';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';

export default function DetalheCofrinhoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cofrinhoId = Number(id);

  const { cofrinhos, carregar: carregarCofrinhos, atualizar, remover } = useCofrinhosStore();
  const { aportes, carregar: carregarAportes, criar: criarAporte } = useAportesCofrinhoStore();
  const { preferencias, carregar: carregarPreferencias } = usePreferenciasStore();

  const [novoAporte, setNovoAporte] = useState(0);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [valorMeta, setValorMeta] = useState(0);
  const [cor, setCor] = useState('#2A5CE0');
  const [dataMeta, setDataMeta] = useState<string | null>(null);
  const [rendimento, setRendimento] = useState<ConfigRendimento>({
    indexador: 'nenhum',
    percentualIndexador: 10000,
    cobraIr: false,
  });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [carregadoParaId, setCarregadoParaId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregarCofrinhos();
      carregarAportes();
      carregarPreferencias();
    }, [carregarCofrinhos, carregarAportes, carregarPreferencias])
  );

  const cofrinho = cofrinhos.find((c) => c.id === cofrinhoId);

  if (cofrinho && carregadoParaId !== cofrinhoId) {
    setCarregadoParaId(cofrinhoId);
    setNome(cofrinho.nome);
    setValorMeta(cofrinho.valorMeta);
    setCor(cofrinho.cor);
    setDataMeta(cofrinho.dataMeta);
    setRendimento({
      indexador: cofrinho.indexador,
      percentualIndexador: cofrinho.percentualIndexador,
      cobraIr: cofrinho.cobraIr,
    });
  }

  const aportesDoCofrinho = aportes
    .filter((a) => a.cofrinhoId === cofrinhoId)
    .sort((a, b) => b.data.localeCompare(a.data));

  if (!cofrinho) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Cofrinho não encontrado.</Text>
      </SafeAreaView>
    );
  }

  const progresso = calcularProgressoCofrinho(cofrinho, aportesDoCofrinho);
  const validoEdicao = nome.trim().length > 0 && valorMeta > 0;

  async function handleAportar() {
    if (novoAporte <= 0) return;
    setSalvando(true);
    try {
      await criarAporte(cofrinhoId, novoAporte);
      setNovoAporte(0);
    } finally {
      setSalvando(false);
    }
  }

  async function handleSalvarEdicao() {
    if (!validoEdicao) return;
    setSalvandoEdicao(true);
    try {
      await atualizar(cofrinhoId, { nome: nome.trim(), valorMeta, cor, dataMeta, ...rendimento });
    } finally {
      setSalvandoEdicao(false);
    }
  }

  function handleRemover() {
    Alert.alert('Remover cofrinho', 'Essa ação não pode ser desfeita. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await remover(cofrinhoId);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ProgressCard
          titulo={nome || cofrinho.nome}
          cor={cor}
          valorAtual={progresso.valorAtual}
          valorMeta={valorMeta || cofrinho.valorMeta}
          percentual={progresso.percentual}
          legenda={
            progresso.previsaoMeses
              ? `Previsão: ${progresso.previsaoMeses} ${progresso.previsaoMeses === 1 ? 'mês' : 'meses'} no ritmo atual`
              : undefined
          }
        />

        <View style={{ height: 12 }} />
        <PainelRendimento
          fluxos={aportesDoCofrinho.map((a) => ({ data: a.data, valor: a.valor }))}
          config={{
            indexador: cofrinho.indexador,
            percentualIndexador: cofrinho.percentualIndexador,
            cobraIr: cofrinho.cobraIr,
          }}
          taxas={{ cdiAnual: preferencias?.taxaCdiAnual ?? null, selicAnual: preferencias?.taxaSelicAnual ?? null }}
          taxasAtualizadasEm={preferencias?.taxasAtualizadasEm ?? null}
          valorMeta={cofrinho.valorMeta}
          dataMeta={cofrinho.dataMeta}
        />

        <View style={{ height: 20 }} />

        <CurrencyInput label="Novo aporte" valor={novoAporte} onChangeValor={setNovoAporte} />
        <Button titulo="Guardar aporte" onPress={handleAportar} disabled={novoAporte <= 0} carregando={salvando} />

        <View style={{ height: 24 }} />

        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 10 }}>
          Histórico de aportes
        </Text>
        {aportesDoCofrinho.length === 0 ? (
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
            Nenhum aporte ainda.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {aportesDoCofrinho.map((aporte) => (
              <Card key={aporte.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13 }}>
                  {formatarData(aporte.data)}
                </Text>
                <Text className="font-heading-medium" style={{ color: colors.success, fontSize: 13 }}>
                  +{formatarMoeda(aporte.valor)}
                </Text>
              </Card>
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />
        <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 12 }}>
          Editar cofrinho
        </Text>
        <TextField label="Nome" value={nome} onChangeText={setNome} />
        <CurrencyInput label="Meta" valor={valorMeta} onChangeValor={setValorMeta} />
        <DateField label="Até quando (opcional)" valor={dataMeta} onChange={setDataMeta} />
        <ConfigRendimentoForm key={carregadoParaId ?? 0} valor={rendimento} onAlterar={setRendimento} />
        <ColorPicker cor={cor} onSelecionar={setCor} />

        <View style={{ gap: 12 }}>
          <Button
            titulo="Salvar alterações"
            onPress={handleSalvarEdicao}
            disabled={!validoEdicao}
            carregando={salvandoEdicao}
          />
          <Button titulo="Remover cofrinho" variante="perigo" onPress={handleRemover} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
