import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarMesReferencia } from '@/core/utils/date';
import { mesVencimentoDaFatura } from '@/domain/usecases/mesDaFatura';
import type { Cartao } from '@/domain/types/entities';

type Props = {
  /** mês de fechamento da fatura da 1ª parcela ('YYYY-MM'), já com o deslocamento aplicado */
  mesPrimeiraParcela: string;
  cartao: Pick<Cartao, 'nome' | 'diaFechamento' | 'diaVencimento'>;
  onMover: (meses: number) => void;
};

/** Mostra em qual fatura a 1ª parcela cai e permite mover mês a mês. */
export function PrimeiraFaturaPicker({ mesPrimeiraParcela, cartao, onMover }: Props) {
  const { colors } = useAppTheme();
  const mesVencimento = mesVencimentoDaFatura(mesPrimeiraParcela, cartao);

  const botao = (rotulo: string, meses: number) => (
    <Pressable
      onPress={() => onMover(meses)}
      hitSlop={8}
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 18 }}>
        {rotulo}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>
        Fatura da 1ª parcela ({cartao.nome})
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {botao('−', -1)}
        <Text
          className="font-heading-medium"
          style={{ color: colors.text, fontSize: 15, flex: 1, textAlign: 'center', textTransform: 'capitalize' }}
        >
          Vence em {formatarMesReferencia(mesVencimento)}
        </Text>
        {botao('+', 1)}
      </View>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
        Calculado pela data da compra e pelo fechamento do cartão (dia {cartao.diaFechamento}). Se estiver no mês
        errado, mova com − e +.
      </Text>
    </View>
  );
}
