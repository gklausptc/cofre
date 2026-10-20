import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type Acao = { icone: React.ComponentProps<typeof Feather>['name']; titulo: string; descricao: string; href: Href };

const ACOES: Acao[] = [
  { icone: 'zap', titulo: 'Gasto rápido', descricao: 'Valor, categoria e pronto', href: '/gasto-rapido' },
  { icone: 'arrow-down-left', titulo: 'Entrada', descricao: 'Salário, PIX recebido, reembolso', href: '/movimentacao/novo?tipo=entrada' },
  { icone: 'repeat', titulo: 'Transferência', descricao: 'Entre contas suas', href: '/movimentacao/novo?tipo=transferencia' },
  { icone: 'arrow-up-right', titulo: 'Saída', descricao: 'Débito, pix ou boleto de uma conta', href: '/movimentacao/novo?tipo=saida' },
  { icone: 'credit-card', titulo: 'Compra parcelada', descricao: 'No cartão, em várias vezes', href: '/compra-parcelada/novo' },
  { icone: 'upload', titulo: 'Importar extrato', descricao: 'CSV ou OFX do banco ou do cartão', href: '/importar-extrato' },
  { icone: 'file-text', titulo: 'Conta fixa', descricao: 'Aluguel, luz, internet, escola', href: '/conta-fixa/novo' },
  { icone: 'gift', titulo: 'Cofrinho', descricao: 'Guardar para um objetivo', href: '/cofrinho/novo' },
];

/** Folha do botão (+): tudo o que dá para lançar, num lugar só. */
export default function AcoesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, gap: 8 }}>
        <Text className="font-heading" style={{ color: colors.text, fontSize: 22, marginBottom: 8 }}>
          O que você quer lançar?
        </Text>
        {ACOES.map((acao) => (
          <Pressable
            key={acao.titulo}
            onPress={() => {
              router.back();
              router.push(acao.href);
            }}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              minHeight: 56,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={acao.icone} size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="font-body-medium" style={{ color: colors.text, fontSize: 15 }}>
                {acao.titulo}
              </Text>
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                {acao.descricao}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
