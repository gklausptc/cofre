import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DateField } from '@/components/DateField';
import { PrimeiraFaturaPicker } from '@/components/PrimeiraFaturaPicker';
import { useCartoesStore } from '@/store/cartoesStore';
import { mesPrimeiraFatura } from '@/domain/usecases/mesDaFatura';
import { CategoryPicker } from '@/components/CategoryPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useParcelasStore } from '@/store/parcelasStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { formatarMoeda } from '@/core/utils/currency';
import { differenceInCalendarMonths, format, parseISO, subMonths } from 'date-fns';

export default function EditarCompraParceladaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const compraId = Number(id);

  const { compras, carregar: carregarCompras, editar } = useComprasParceladasStore();
  const { parcelas, carregar: carregarParcelas } = useParcelasStore();
  const { categorias, carregar: carregarCategorias } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();

  const compra = compras.find((c) => c.id === compraId);

  const [descricao, setDescricao] = useState('');
  const [valorTotal, setValorTotal] = useState(0);
  const [data, setData] = useState<string | null>(null);
  const [numParcelas, setNumParcelas] = useState('');
  const [deslocamento, setDeslocamento] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [membroId, setMembroId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregadoParaId, setCarregadoParaId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregarCompras();
      carregarParcelas();
      carregarCategorias();
      carregarMembros();
      carregarCartoes();
    }, [carregarCompras, carregarParcelas, carregarCategorias, carregarMembros, carregarCartoes])
  );

  if (compra && carregadoParaId !== compraId) {
    setCarregadoParaId(compraId);
    setDescricao(compra.descricao);
    setValorTotal(compra.valorTotal);
    setData(compra.dataCompra);
    setNumParcelas(String(compra.numParcelas));
    setCategoriaId(compra.categoriaId);
    setMembroId(compra.membroId);
  }

  const cartao = compra ? cartoes.find((c) => c.id === compra.cartaoId) : undefined;
  const parcelasDaCompra = compra ? parcelas.filter((p) => p.compraParceladaId === compraId) : [];

  // Deslocamento inicial: reproduz a fatura em que a 1ª parcela está hoje, para nada mudar sem você pedir
  if (compra && cartao && deslocamento === null && parcelasDaCompra.length > 0) {
    const referencia = [...parcelasDaCompra].sort((a, b) => a.numero - b.numero)[0];
    const fechamentoDaParcela1 = format(subMonths(parseISO(`${referencia.mesReferencia}-01`), referencia.numero - 1), 'yyyy-MM');
    const base = mesPrimeiraFatura(compra.dataCompra, cartao, 0) ?? fechamentoDaParcela1;
    setDeslocamento(differenceInCalendarMonths(parseISO(`${fechamentoDaParcela1}-01`), parseISO(`${base}-01`)));
  }

  if (!compra) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Compra não encontrada.</Text>
      </SafeAreaView>
    );
  }

  const pagas = parcelasDaCompra.filter((p) => p.status === 'paga');
  const totalPago = pagas.reduce((soma, p) => soma + p.valor, 0);

  const mesPrimeiraParcela = cartao ? mesPrimeiraFatura(data, cartao, deslocamento ?? 0) : null;
  const qtd = parseInt(numParcelas, 10);
  const valido = descricao.trim().length > 0 && valorTotal > 0 && data !== null && qtd >= 1 && qtd <= 48 && mesPrimeiraParcela !== null;

  const dataOriginal = compra.dataCompra;

  async function handleSalvar() {
    if (!valido || mesPrimeiraParcela === null) return;
    setSalvando(true);
    try {
      await editar(compraId, {
        descricao: descricao.trim(),
        valorTotal,
        numParcelas: qtd,
        dataCompra: data ?? dataOriginal,
        mesPrimeiraParcela,
        categoriaId,
        membroId,
      });
      await carregarParcelas();
      router.back();
    } catch (erro) {
      Alert.alert('Não foi possível salvar', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {pagas.length > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }}>
              {pagas.length} parcela{pagas.length === 1 ? '' : 's'} já paga{pagas.length === 1 ? '' : 's'} (
              {formatarMoeda(totalPago)})
            </Text>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
              Parcelas pagas não mudam. O novo valor e o novo número de parcelas se aplicam só às pendentes.
            </Text>
          </Card>
        )}

        <TextField label="Descrição" value={descricao} onChangeText={setDescricao} />
        <CurrencyInput label="Valor total" valor={valorTotal} onChangeValor={setValorTotal} />
        <DateField label="Data da compra" valor={data} onChange={setData} />
        {cartao && mesPrimeiraParcela && (
          <PrimeiraFaturaPicker
            mesPrimeiraParcela={mesPrimeiraParcela}
            cartao={cartao}
            onMover={(meses) => setDeslocamento((d) => (d ?? 0) + meses)}
          />
        )}
        <TextField
          label="Número de parcelas"
          keyboardType="numeric"
          value={numParcelas}
          onChangeText={setNumParcelas}
        />
        <CategoryPicker
          categorias={categorias}
          tipo="despesa"
          categoriaId={categoriaId}
          onSelecionar={setCategoriaId}
        />
        <MemberPicker membros={membros} membroId={membroId} onSelecionar={setMembroId} />

        <View style={{ marginTop: 8 }}>
          <Button titulo="Salvar alterações" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
