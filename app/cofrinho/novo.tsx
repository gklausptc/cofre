import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TextField } from '@/components/TextField';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DateField } from '@/components/DateField';
import { ChipSelect } from '@/components/ChipSelect';
import { ColorPicker, CORES_DISPONIVEIS } from '@/components/ColorPicker';
import { ConfigRendimentoForm } from '@/components/ConfigRendimentoForm';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useCofrinhosStore } from '@/store/cofrinhosStore';
import type { ConfigRendimento } from '@/domain/usecases/rendimento';

type Modelo = 'viagem' | 'carro' | 'presente' | 'investimentos' | 'outra';

/** Atalhos para os usos mais comuns: preenchem nome, ícone e, para investimentos, o rendimento. */
const MODELOS: Record<Modelo, { rotulo: string; nome: string; icone: string; rendimento?: ConfigRendimento }> = {
  viagem: { rotulo: 'Viagem', nome: 'Viagem', icone: 'map' },
  carro: { rotulo: 'Carro', nome: 'Carro', icone: 'truck' },
  presente: { rotulo: 'Presente', nome: 'Presente', icone: 'gift' },
  investimentos: {
    rotulo: 'Investimentos',
    nome: 'Investimentos',
    icone: 'trending-up',
    rendimento: { indexador: 'cdi', percentualIndexador: 10000, cobraIr: true },
  },
  outra: { rotulo: 'Outra meta', nome: '', icone: 'target' },
};

const SEM_RENDIMENTO: ConfigRendimento = { indexador: 'nenhum', percentualIndexador: 10000, cobraIr: false };

export default function NovoCofrinhoScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const criar = useCofrinhosStore((s) => s.criar);

  const [modelo, setModelo] = useState<Modelo>('outra');
  const [nome, setNome] = useState('');
  const [valorMeta, setValorMeta] = useState(0);
  const [dataMeta, setDataMeta] = useState<string | null>(null);
  const [cor, setCor] = useState(CORES_DISPONIVEIS[3]);
  const [rendimento, setRendimento] = useState<ConfigRendimento>(SEM_RENDIMENTO);
  const [salvando, setSalvando] = useState(false);

  const valido = nome.trim().length > 0 && valorMeta > 0;

  function handleModelo(novo: Modelo) {
    const nomesDosModelos = Object.values(MODELOS).map((m) => m.nome);
    // só troca o nome se ele ainda é o de um modelo (não apaga o que a pessoa digitou)
    if (nome.trim() === '' || nomesDosModelos.includes(nome.trim())) setNome(MODELOS[novo].nome);
    setRendimento(MODELOS[novo].rendimento ?? rendimento);
    setModelo(novo);
  }

  async function handleSalvar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await criar({ nome: nome.trim(), valorMeta, dataMeta, cor, icone: MODELOS[modelo].icone, ...rendimento });
      router.back();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <ChipSelect
          label="Para quê"
          opcoes={(Object.keys(MODELOS) as Modelo[]).map((valor) => ({ valor, rotulo: MODELOS[valor].rotulo }))}
          valor={modelo}
          onSelecionar={handleModelo}
        />
        <TextField label="Nome" placeholder="Ex.: Viagem para a praia" value={nome} onChangeText={setNome} />
        <CurrencyInput label="Meta" valor={valorMeta} onChangeValor={setValorMeta} />
        <DateField label="Até quando (opcional)" valor={dataMeta} onChange={setDataMeta} />
        <ConfigRendimentoForm key={modelo} valor={rendimento} onAlterar={setRendimento} />
        <ColorPicker cor={cor} onSelecionar={setCor} />
        <Button titulo="Criar cofrinho" onPress={handleSalvar} disabled={!valido} carregando={salvando} />
      </ScrollView>
    </SafeAreaView>
  );
}
