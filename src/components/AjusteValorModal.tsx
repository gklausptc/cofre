import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { CurrencyInput } from '@/components/CurrencyInput';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';

type Props = {
  nome: string;
  valorAtual: number;
  onCancelar: () => void;
  onConfirmar: (novoValor: number, justificativa: string) => Promise<void>;
};

/** Alteração de valor de um pagamento — a justificativa é obrigatória. */
export function AjusteValorModal({ nome, valorAtual, onCancelar, onConfirmar }: Props) {
  const { colors } = useAppTheme();
  const [valor, setValor] = useState(valorAtual);
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);

  const mudou = valor > 0 && valor !== valorAtual;
  const valido = mudou && justificativa.trim().length >= 3;

  async function handleConfirmar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await onConfirmar(valor, justificativa.trim());
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancelar}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        <Pressable style={{ flex: 1 }} onPress={onCancelar} />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 20,
            paddingBottom: 32,
          }}
        >
          <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16 }}>
            Alterar valor
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 16 }}>
            {nome} · valor atual {formatarMoeda(valorAtual)}
          </Text>
          <CurrencyInput label="Novo valor" valor={valor} onChangeValor={setValor} />
          <TextField
            label="Justificativa (obrigatória)"
            placeholder="Ex.: desconto, juros, multa, erro de lançamento"
            value={justificativa}
            onChangeText={setJustificativa}
          />
          <View style={{ gap: 10 }}>
            <Button titulo="Salvar novo valor" onPress={handleConfirmar} disabled={!valido} carregando={salvando} />
            <Button titulo="Cancelar" variante="secundaria" onPress={onCancelar} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
