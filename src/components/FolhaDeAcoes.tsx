import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type Acao = { icone: React.ComponentProps<typeof Feather>['name']; titulo: string; descricao: string; href: Href };

/** O mais usado, em destaque no topo. */
const PRINCIPAL: Acao = { icone: 'zap', titulo: 'Gasto rápido', descricao: 'Valor, categoria e pronto', href: '/gasto-rapido' };

/** A grade do meio: lançamentos de conta e de cartão. */
const GRADE: Acao[] = [
  { icone: 'arrow-down-left', titulo: 'Entrada', descricao: 'Salário, PIX recebido, reembolso', href: '/movimentacao/novo?tipo=entrada' },
  { icone: 'arrow-up-right', titulo: 'Saída', descricao: 'Débito, pix ou boleto de uma conta', href: '/movimentacao/novo?tipo=saida' },
  { icone: 'repeat', titulo: 'Transferência', descricao: 'Entre contas suas', href: '/movimentacao/novo?tipo=transferencia' },
  { icone: 'credit-card', titulo: 'Parcelada', descricao: 'Compra no cartão em várias vezes', href: '/compra-parcelada/novo' },
  { icone: 'file-text', titulo: 'Conta fixa', descricao: 'Aluguel, luz, internet, escola', href: '/conta-fixa/novo' },
  { icone: 'gift', titulo: 'Cofrinho', descricao: 'Guardar para um objetivo', href: '/cofrinho/novo' },
];

/** Embaixo: trazer do banco. */
const IMPORTAR: Acao = { icone: 'upload', titulo: 'Importar extratos', descricao: 'CSV, OFX ou PDF, um ou vários de uma vez', href: '/importar-extrato' };

export const ACOES: Acao[] = [PRINCIPAL, ...GRADE, IMPORTAR];

/** As ações do botão (+): gasto rápido em destaque, uma grade com o resto e a importação. */
export function ListaDeAcoes({ onEscolher }: { onEscolher: (href: Href) => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={() => onEscolher(PRINCIPAL.href)}
        accessibilityRole="button"
        accessibilityLabel={`${PRINCIPAL.titulo}: ${PRINCIPAL.descricao}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          minHeight: 64,
          borderRadius: 16,
          backgroundColor: colors.brand,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={PRINCIPAL.icone} size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text className="font-heading-medium" style={{ color: '#FFFFFF', fontSize: 16 }}>
            {PRINCIPAL.titulo}
          </Text>
          <Text className="font-body" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
            {PRINCIPAL.descricao}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color="#FFFFFF" />
      </Pressable>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        {GRADE.map((acao) => (
          <Pressable
            key={acao.titulo}
            onPress={() => onEscolher(acao.href)}
            accessibilityRole="button"
            accessibilityLabel={`${acao.titulo}: ${acao.descricao}`}
            style={({ pressed }) => ({
              width: '31.5%',
              minHeight: 92,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              paddingHorizontal: 6,
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={acao.icone} size={18} color={colors.brand} />
            </View>
            <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13, textAlign: 'center' }} numberOfLines={1}>
              {acao.titulo}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => onEscolher(IMPORTAR.href)}
        accessibilityRole="button"
        accessibilityLabel={`${IMPORTAR.titulo}: ${IMPORTAR.descricao}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          minHeight: 56,
          borderRadius: 14,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.brand,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Feather name={IMPORTAR.icone} size={18} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
            {IMPORTAR.titulo}
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
            {IMPORTAR.descricao}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

type Props = {
  visivel: boolean;
  onFechar: () => void;
  onEscolher: (href: Href) => void;
  /** Chamado quando a folha terminou de fechar (iOS): só então dá para abrir outra tela modal. */
  onFechada?: () => void;
};

/** Folha que sobe de baixo com as ações do (+). Modal do próprio React Native: abre sempre, no Expo Go também. */
export function FolhaDeAcoes({ visivel, onFechar, onEscolher, onFechada }: Props) {
  const { colors } = useAppTheme();
  const margens = useSafeAreaInsets();
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar} onDismiss={onFechada}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onFechar}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
        />
        <View
          style={{
            maxHeight: '88%',
            backgroundColor: colors.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            paddingBottom: Math.max(margens.bottom, 16),
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <Text className="font-heading" style={{ color: colors.text, fontSize: 18, flex: 1 }}>
              Lançar
            </Text>
            <Pressable onPress={onFechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar" style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            <ListaDeAcoes onEscolher={onEscolher} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A folha de ações pronta para usar: `abrir()` mostra a folha; ao escolher, ela fecha e abre a
 * tela (no iOS, só depois de terminar de fechar — senão a tela modal seguinte não aparece).
 */
export function useFolhaDeAcoes(): { abrir: () => void; folha: React.ReactElement } {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const destino = useRef<Href | null>(null);
  const abrirDestino = () => {
    const href = destino.current;
    destino.current = null;
    if (href) router.push(href);
  };
  const folha = (
    <FolhaDeAcoes
      visivel={aberta}
      onFechar={() => setAberta(false)}
      onEscolher={(href) => {
        destino.current = href;
        setAberta(false);
        if (Platform.OS !== 'ios') abrirDestino();
      }}
      onFechada={abrirDestino}
    />
  );
  return { abrir: () => setAberta(true), folha };
}
