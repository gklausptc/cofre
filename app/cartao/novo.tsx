import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ColorPicker, CORES_DISPONIVEIS } from '@/components/ColorPicker';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCartoesStore } from '@/store/cartoesStore';

export default function NovoCartaoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const criar = useCartoesStore((s) => s.criar);

  const [nome, setNome] = useState('');
  const [limite, setLimite] = useState(0);
  const [diaFechamento, setDiaFechamento] = useState('20');
  const [diaVencimento, setDiaVencimento] = useState('27');
  const [cor, setCor] = useState(CORES_DISPONIVEIS[2]);
  const [salvando, setSalvando] = useState(false);

  const fechamento = parseInt(diaFechamento, 10);
  const vencimento = parseInt(diaVencimento, 10);
  const valido =
    nome.trim().length > 0 &&
    limite > 0 &&
    fechamento >= 1 &&
    fechamento <= 31 &&
    vencimento >= 1 &&
    vencimento <= 31;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await criar({
        nome: nome.trim(),
        limite,
        diaFechamento: fechamento,
        diaVencimento: vencimento,
        cor,
      });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TextField label="Nome" placeholder="Ex.: Nubank Roxinho" value={nome} onChangeText={setNome} />
        <CurrencyInput label="Limite" valor={limite} onChangeValor={setLimite} />
        <TextField
          label="Dia de fechamento"
          placeholder="1 a 31"
          keyboardType="numeric"
          value={diaFechamento}
          onChangeText={setDiaFechamento}
        />
        <TextField
          label="Dia de vencimento"
          placeholder="1 a 31"
          keyboardType="numeric"
          value={diaVencimento}
          onChangeText={setDiaVencimento}
        />
        <ColorPicker cor={cor} onSelecionar={setCor} />
        <Button titulo="Salvar cartão" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
      </ScrollView>
    </SafeAreaView>
  );
}
