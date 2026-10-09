import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DateField } from '@/components/DateField';
import { PrimeiraFaturaPicker } from '@/components/PrimeiraFaturaPicker';
import { useCartoesStore } from '@/store/cartoesStore';
import { mesPrimeiraFatura } from '@/domain/usecases/mesDaFatura';
import { CategoryPicker } from '@/components/CategoryPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useComprasParceladasStore } from '@/store/comprasParceladasStore';
import { useCategoriasStore } from '@/store/categoriasStore';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';
import { hojeIso } from '@/core/utils/date';

export default function NovaCompraParceladaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { cartaoId } = useLocalSearchParams<{ cartaoId: string }>();
  const criar = useComprasParceladasStore((s) => s.criar);
  const { categorias, carregar } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();

  const [descricao, setDescricao] = useState('');
  const [valorTotal, setValorTotal] = useState(0);
  const [data, setData] = useState<string | null>(hojeIso());
  const [numParcelas, setNumParcelas] = useState('1');
  const [deslocamento, setDeslocamento] = useState(0);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [membroId, setMembroId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
    carregarMembros();
    carregarCartoes();
  }, [carregar, carregarMembros, carregarCartoes]);

  const cartao = cartoes.find((c) => c.id === Number(cartaoId));
  const mesPrimeiraParcela = cartao ? mesPrimeiraFatura(data, cartao, deslocamento) : null;
  const parcelas = parseInt(numParcelas, 10);
  const valido = descricao.trim().length > 0 && valorTotal > 0 && data !== null && parcelas >= 1 && parcelas <= 48;

  async function handleSalvar() {
    if (!valido || !cartaoId) return;
    setSalvando(true);
    try {
      await criar(
        {
        descricao: descricao.trim(),
        valorTotal,
        numParcelas: parcelas,
        cartaoId: Number(cartaoId),
        categoriaId,
        dataCompra: data ?? hojeIso(),
        membroId,
        },
        mesPrimeiraParcela ?? undefined
      );
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TextField label="Descrição" placeholder="Ex.: Geladeira" value={descricao} onChangeText={setDescricao} />
        <CurrencyInput label="Valor total" valor={valorTotal} onChangeValor={setValorTotal} />
        <DateField label="Data da compra" valor={data} onChange={setData} />
        {cartao && mesPrimeiraParcela && (
          <PrimeiraFaturaPicker
            mesPrimeiraParcela={mesPrimeiraParcela}
            cartao={cartao}
            onMover={(meses) => setDeslocamento((d) => d + meses)}
          />
        )}
        <TextField
          label="Número de parcelas"
          placeholder="Ex.: 10"
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
        <Button titulo="Salvar compra" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
      </ScrollView>
    </SafeAreaView>
  );
}
