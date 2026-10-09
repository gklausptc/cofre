import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ColorPicker, CORES_DISPONIVEIS } from '@/components/ColorPicker';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCofrinhosStore } from '@/store/cofrinhosStore';

export default function NovoCofrinhoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const criar = useCofrinhosStore((s) => s.criar);

  const [nome, setNome] = useState('');
  const [valorMeta, setValorMeta] = useState(0);
  const [cor, setCor] = useState(CORES_DISPONIVEIS[3]);
  const [salvando, setSalvando] = useState(false);

  const valido = nome.trim().length > 0 && valorMeta > 0;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await criar({ nome: nome.trim(), valorMeta, dataMeta: null, cor, icone: 'gift' });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TextField label="Nome" placeholder="Ex.: Viagem para a praia" value={nome} onChangeText={setNome} />
        <CurrencyInput label="Meta" valor={valorMeta} onChangeValor={setValorMeta} />
        <ColorPicker cor={cor} onSelecionar={setCor} />
        <Button titulo="Criar cofrinho" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
      </ScrollView>
    </SafeAreaView>
  );
}
