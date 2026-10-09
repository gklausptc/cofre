import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DateField } from '@/components/DateField';
import { CategoryPicker } from '@/components/CategoryPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { TextField } from '@/components/TextField';
import { PagamentoGastoPicker, type FormaPagamentoGasto } from '@/components/PagamentoGastoPicker';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useGastosRapidosStore } from '@/store/gastosRapidosStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCartoesStore } from '@/store/cartoesStore';

export default function EditarGastoRapidoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gastoId = Number(id);

  const { categorias, carregar } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const { gastos, carregar: carregarGastos, atualizar, remover } = useGastosRapidosStore();

  const gasto = gastos.find((g) => g.id === gastoId);

  const [valor, setValor] = useState(0);
  const [data, setData] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [descricao, setDescricao] = useState('');
  const [membroId, setMembroId] = useState<number | null>(null);
  const [forma, setForma] = useState<FormaPagamentoGasto>('dinheiro');
  const [contaId, setContaId] = useState<number | null>(null);
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregadoParaId, setCarregadoParaId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarMembros();
      carregarGastos();
      carregarContas();
      carregarCartoes();
    }, [carregar, carregarMembros, carregarGastos, carregarContas, carregarCartoes])
  );

  // Ver comentário equivalente em movimentacao/[id].tsx.
  if (gasto && carregadoParaId !== gastoId) {
    setCarregadoParaId(gastoId);
    setValor(gasto.valor);
    setData(gasto.data);
    setCategoriaId(gasto.categoriaId);
    setDescricao(gasto.descricao ?? '');
    setMembroId(gasto.membroId);
    setForma(gasto.formaPagamento);
    setContaId(gasto.contaBancariaId);
    setCartaoId(gasto.cartaoId);
  }

  if (!gasto) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Gasto não encontrado.</Text>
      </SafeAreaView>
    );
  }

  const contaSelecionada = contaId ?? contas[0]?.id ?? null;
  const cartaoSelecionado = cartaoId ?? cartoes[0]?.id ?? null;
  const usaConta = forma === 'debito' || forma === 'pix';
  const valido =
    valor > 0 && data !== null && (!usaConta || contaSelecionada !== null) && (forma !== 'cartao' || cartaoSelecionado !== null);

  const dataOriginal = gasto.data;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await atualizar(gastoId, {
        valor,
        data: data ?? dataOriginal,
        categoriaId,
        descricao: descricao.trim() || null,
        membroId,
        formaPagamento: forma,
        contaBancariaId: usaConta ? contaSelecionada : null,
        cartaoId: forma === 'cartao' ? cartaoSelecionado : null,
      });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  function handleRemover() {
    Alert.alert('Remover gasto', 'Essa ação não pode ser desfeita. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await remover(gastoId);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <CurrencyInput label="Valor" valor={valor} onChangeValor={setValor} />
        <DateField label="Data da compra" valor={data} onChange={setData} />
        <CategoryPicker
          categorias={categorias}
          tipo="despesa"
          categoriaId={categoriaId}
          onSelecionar={setCategoriaId}
        />
        <TextField
          label="Descrição (opcional)"
          placeholder="Ex.: Padaria"
          value={descricao}
          onChangeText={setDescricao}
        />
        <PagamentoGastoPicker
          forma={forma}
          contaBancariaId={contaSelecionada}
          cartaoId={cartaoSelecionado}
          contas={contas}
          cartoes={cartoes}
          onFormaChange={setForma}
          onContaChange={setContaId}
          onCartaoChange={setCartaoId}
        />
        <MemberPicker membros={membros} membroId={membroId} onSelecionar={setMembroId} />
        <View style={{ gap: 12, marginTop: 8 }}>
          <Button titulo="Salvar alterações" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
          <Button titulo="Remover gasto" variante="perigo" onPress={handleRemover} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
