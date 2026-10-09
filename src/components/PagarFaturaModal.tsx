import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMoeda } from '@/core/utils/currency';
import type { ContaBancaria } from '@/domain/types/entities';

type Props = {
  titulo: string;
  valor: number;
  contas: Pick<ContaBancaria, 'id' | 'nomeConta' | 'cor'>[];
  onCancelar: () => void;
  onConfirmar: (contaBancariaId: number | null) => Promise<void>;
};

/** Confirma o pagamento da fatura e escolhe de qual conta o valor sai. */
export function PagarFaturaModal({ titulo, valor, contas, onCancelar, onConfirmar }: Props) {
  const { colors } = useAppTheme();
  const [contaId, setContaId] = useState<number | null>(contas[0]?.id ?? null);
  const [salvando, setSalvando] = useState(false);

  async function handleConfirmar() {
    setSalvando(true);
    try {
      await onConfirmar(contaId);
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = [
    ...contas.map((c) => ({ id: c.id as number | null, rotulo: c.nomeConta, cor: c.cor })),
    { id: null, rotulo: 'Não descontar de conta', cor: colors.textMuted },
  ];

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancelar}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
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
            Pagar {titulo}
          </Text>
          <Text className="font-heading" style={{ color: colors.text, fontSize: 26, marginTop: 4, marginBottom: 16 }}>
            {formatarMoeda(valor)}
          </Text>
          <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
            Pagar com qual conta?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {opcoes.map((opcao) => {
              const ativo = opcao.id === contaId;
              return (
                <Pressable
                  key={opcao.id ?? 'nenhuma'}
                  onPress={() => setContaId(opcao.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: ativo ? opcao.cor : colors.surface,
                    borderWidth: 1,
                    borderColor: ativo ? opcao.cor : colors.border,
                  }}
                >
                  <Text className="font-body-medium" style={{ color: ativo ? '#FFFFFF' : colors.text, fontSize: 13 }}>
                    {opcao.rotulo}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ gap: 10 }}>
            <Button titulo="Confirmar pagamento" onPress={handleConfirmar} carregando={salvando} />
            <Button titulo="Cancelar" variante="secundaria" onPress={onCancelar} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
