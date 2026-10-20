import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { ColorPicker, CORES_DISPONIVEIS } from '@/components/ColorPicker';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useMovimentacoesStore } from '@/store/movimentacoesStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { calcularSaldoConta } from '@/domain/usecases/calcularSaldoConta';
import { formatarMoeda } from '@/core/utils/currency';

export default function DetalheContaBancariaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const contaId = Number(id);

  const { contas, atualizar, remover } = useContasBancariasStore();
  const { movimentacoes, carregar: carregarMovimentacoes } = useMovimentacoesStore();
  const { gastos, carregar: carregarGastos } = useGastosRapidosStore();
  const conta = contas.find((c) => c.id === contaId);

  const [banco, setBanco] = useState(conta?.banco ?? '');
  const [nomeConta, setNomeConta] = useState(conta?.nomeConta ?? '');
  const [cor, setCor] = useState(conta?.cor ?? CORES_DISPONIVEIS[0]);
  const [salvando, setSalvando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarMovimentacoes();
      carregarGastos();
    }, [carregarMovimentacoes, carregarGastos])
  );

  if (!conta) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Conta não encontrada.</Text>
      </SafeAreaView>
    );
  }

  const saldo = calcularSaldoConta(conta, movimentacoes, gastos);

  async function handleSalvar() {
    setSalvando(true);
    try {
      await atualizar(contaId, { banco: banco.trim(), nomeConta: nomeConta.trim(), cor });
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemover() {
    await remover(contaId);
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Card style={{ marginBottom: 20, backgroundColor: colors.brand, borderWidth: 0 }}>
          <Text className="font-body" style={{ color: '#E9F3EC', fontSize: 12 }}>
            Saldo atual
          </Text>
          <Text className="font-heading" style={{ color: '#FFFFFF', fontSize: 28, marginTop: 4 }}>
            {formatarMoeda(saldo)}
          </Text>
        </Card>

        <TextField label="Banco" value={banco} onChangeText={setBanco} />
        <TextField label="Nome da conta" value={nomeConta} onChangeText={setNomeConta} />
        <ColorPicker cor={cor} onSelecionar={setCor} />

        <View style={{ gap: 12, marginTop: 8 }}>
          <Button titulo="Salvar alterações" onPress={handleSalvar} carregando={salvando} />
          <Button titulo="Remover conta" variante="perigo" onPress={handleRemover} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
