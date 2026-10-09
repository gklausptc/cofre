import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ColorPicker, CORES_DISPONIVEIS } from '@/components/ColorPicker';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useContasBancariasStore } from '@/store/contasBancariasStore';

export default function NovaContaBancariaScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const criar = useContasBancariasStore((s) => s.criar);

  const [banco, setBanco] = useState('');
  const [nomeConta, setNomeConta] = useState('');
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [cor, setCor] = useState(CORES_DISPONIVEIS[0]);
  const [salvando, setSalvando] = useState(false);

  const valido = banco.trim().length > 0 && nomeConta.trim().length > 0;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await criar({ banco: banco.trim(), nomeConta: nomeConta.trim(), saldoInicial, cor, icone: 'dollar-sign' });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TextField label="Banco" placeholder="Ex.: Nubank" value={banco} onChangeText={setBanco} />
        <TextField
          label="Nome da conta"
          placeholder="Ex.: Conta corrente"
          value={nomeConta}
          onChangeText={setNomeConta}
        />
        <CurrencyInput label="Saldo inicial" valor={saldoInicial} onChangeValor={setSaldoInicial} />
        <ColorPicker cor={cor} onSelecionar={setCor} />
        <View style={{ marginTop: 8 }}>
          <Button titulo="Salvar conta" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
