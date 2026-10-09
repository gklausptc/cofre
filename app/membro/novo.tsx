import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { ColorPicker, CORES_DISPONIVEIS } from '@/components/ColorPicker';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useMembrosFamiliaStore } from '@/store/membrosFamiliaStore';

export default function NovoMembroScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const criar = useMembrosFamiliaStore((s) => s.criar);

  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES_DISPONIVEIS[4]);
  const [salvando, setSalvando] = useState(false);

  const valido = nome.trim().length > 0;

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await criar({ nome: nome.trim(), cor, icone: 'user' });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TextField label="Nome" placeholder="Ex.: Maria" value={nome} onChangeText={setNome} />
        <ColorPicker cor={cor} onSelecionar={setCor} />
        <Button titulo="Salvar membro" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
      </ScrollView>
    </SafeAreaView>
  );
}
