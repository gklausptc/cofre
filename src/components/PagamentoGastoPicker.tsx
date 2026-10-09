import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChipSelect } from '@/components/ChipSelect';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import type { Cartao, ContaBancaria, GastoRapido } from '@/domain/types/entities';

export type FormaPagamentoGasto = GastoRapido['formaPagamento'];

const OPCOES: { valor: FormaPagamentoGasto; rotulo: string }[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'debito', rotulo: 'Débito' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cartao', rotulo: 'Cartão' },
];

type Props = {
  forma: FormaPagamentoGasto;
  contaBancariaId: number | null;
  cartaoId: number | null;
  contas: Pick<ContaBancaria, 'id' | 'nomeConta' | 'cor'>[];
  cartoes: Pick<Cartao, 'id' | 'nome' | 'cor'>[];
  onFormaChange: (forma: FormaPagamentoGasto) => void;
  onContaChange: (id: number) => void;
  onCartaoChange: (id: number) => void;
};

function Chips({
  itens,
  selecionado,
  onSelecionar,
}: {
  itens: { id: number; rotulo: string; cor: string }[];
  selecionado: number | null;
  onSelecionar: (id: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {itens.map((item) => {
        const ativo = item.id === selecionado;
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelecionar(item.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: ativo ? item.cor : colors.surface,
              borderWidth: 1,
              borderColor: ativo ? item.cor : colors.border,
            }}
          >
            <Text className="font-body-medium" style={{ color: ativo ? '#FFFFFF' : colors.text, fontSize: 13 }}>
              {item.rotulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Forma de pagamento de um gasto + a conta (débito/pix) ou cartão usado. */
export function PagamentoGastoPicker({
  forma,
  contaBancariaId,
  cartaoId,
  contas,
  cartoes,
  onFormaChange,
  onContaChange,
  onCartaoChange,
}: Props) {
  const { colors } = useAppTheme();
  const precisaConta = forma === 'debito' || forma === 'pix';

  return (
    <>
      <ChipSelect label="Forma de pagamento" opcoes={OPCOES} valor={forma} onSelecionar={onFormaChange} />
      {precisaConta &&
        (contas.length === 0 ? (
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
            Cadastre uma conta bancária para descontar este gasto do saldo.
          </Text>
        ) : (
          <>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Conta
            </Text>
            <Chips
              itens={contas.map((c) => ({ id: c.id, rotulo: c.nomeConta, cor: c.cor }))}
              selecionado={contaBancariaId}
              onSelecionar={onContaChange}
            />
          </>
        ))}
      {forma === 'cartao' &&
        (cartoes.length === 0 ? (
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
            Cadastre um cartão na aba Cartões para lançar gastos nele.
          </Text>
        ) : (
          <>
            <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Cartão
            </Text>
            <Chips
              itens={cartoes.map((c) => ({ id: c.id, rotulo: c.nome, cor: c.cor }))}
              selecionado={cartaoId}
              onSelecionar={onCartaoChange}
            />
          </>
        ))}
    </>
  );
}
