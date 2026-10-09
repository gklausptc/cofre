import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { hojeIso } from '@/core/utils/date';

export default function GastoRapidoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { categorias, carregar } = useCategoriasStore();
  const { membros, carregar: carregarMembros } = useMembrosFamiliaStore();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();
  const criar = useGastosRapidosStore((s) => s.criar);

  const [valor, setValor] = useState(0);
  const [data, setData] = useState<string | null>(hojeIso());
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [descricao, setDescricao] = useState('');
  const [membroId, setMembroId] = useState<number | null>(null);
  const [forma, setForma] = useState<FormaPagamentoGasto>('dinheiro');
  const [contaId, setContaId] = useState<number | null>(null);
  const [cartaoId, setCartaoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
    carregarMembros();
    carregarContas();
    carregarCartoes();
  }, [carregar, carregarMembros, carregarContas, carregarCartoes]);

  const contaSelecionada = contaId ?? contas[0]?.id ?? null;
  const cartaoSelecionado = cartaoId ?? cartoes[0]?.id ?? null;
  const usaConta = forma === 'debito' || forma === 'pix';
  const valido =
    valor > 0 && data !== null && (!usaConta || contaSelecionada !== null) && (forma !== 'cartao' || cartaoSelecionado !== null);

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await criar({
        valor,
        categoriaId,
        descricao: descricao.trim() || null,
        data: data ?? hojeIso(),
        formaPagamento: forma,
        contaBancariaId: usaConta ? contaSelecionada : null,
        cartaoId: forma === 'cartao' ? cartaoSelecionado : null,
        membroId,
      });
      router.back();
    } finally {
      setSalvando(false);
    }
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
        <View style={{ marginTop: 8 }}>
          <Button titulo="Salvar gasto" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
