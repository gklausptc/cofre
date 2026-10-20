import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/core/theme/ThemeProvider';

type ItemMenu = {
  icon: React.ComponentProps<typeof Feather>['name'];
  titulo: string;
  href?: Href;
};

const ITENS: ItemMenu[] = [
  { icon: 'credit-card', titulo: 'Cartões', href: '/cartoes' },
  { icon: 'trending-up', titulo: 'Planejamento', href: '/planejamento' },
  { icon: 'file-text', titulo: 'Contas fixas', href: '/conta-fixa' },
  { icon: 'dollar-sign', titulo: 'Contas bancárias', href: '/conta-bancaria' },
  { icon: 'upload', titulo: 'Importar extrato', href: '/importar-extrato' },
  { icon: 'layers', titulo: 'Importar vários (o ano todo)', href: '/importar-extrato/lote' },
  { icon: 'clock', titulo: 'Importações anteriores', href: '/importar-extrato/historico' },
  { icon: 'tag', titulo: 'Categorias', href: '/categorias' },
  { icon: 'zap', titulo: 'Regras aprendidas', href: '/regras' },
  { icon: 'help-circle', titulo: 'Revisão da importação', href: '/revisao' },
  { icon: 'download', titulo: 'Exportar extrato', href: '/exportar-extrato' },
  { icon: 'target', titulo: 'Metas financeiras', href: '/metas' },
  { icon: 'pie-chart', titulo: 'Orçamento do mês', href: '/orcamento' },
  { icon: 'repeat', titulo: 'Assinaturas', href: '/assinaturas' },
  { icon: 'calendar', titulo: 'Fechamento do mês', href: '/fechamento-mes' },
  { icon: 'search', titulo: 'Buscar lançamentos', href: '/busca' },
  { icon: 'shopping-cart', titulo: 'Dá para comprar?', href: '/simulador' },
  { icon: 'gift', titulo: 'Cofrinhos', href: '/cofrinho' },
  { icon: 'shield', titulo: 'Reserva de emergência', href: '/reserva-emergencia' },
  { icon: 'bar-chart-2', titulo: 'Relatórios', href: '/relatorios' },
  { icon: 'calendar', titulo: 'Relatório do ano', href: '/relatorios/anual' },
  { icon: 'users', titulo: 'Membros da família', href: '/membro' },
  { icon: 'save', titulo: 'Backup e restauração', href: '/backup' },
  { icon: 'settings', titulo: 'Configurações', href: '/configuracoes' },
];

function MenuRow({ item, ultimo }: { item: ItemMenu; ultimo: boolean }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const disponivel = Boolean(item.href);

  return (
    <Pressable
      disabled={!disponivel}
      onPress={() => item.href && router.push(item.href)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: ultimo ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: disponivel ? 1 : 0.5,
      }}
    >
      <Feather name={item.icon} size={18} color={colors.brand} style={{ width: 28 }} />
      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 15, flex: 1 }}>
        {item.titulo}
      </Text>
      {disponivel ? (
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      ) : (
        <Text className="font-body" style={{ color: colors.textMuted, fontSize: 11 }}>
          em breve
        </Text>
      )}
    </Pressable>
  );
}

export default function MaisScreen() {
  const { colors } = useAppTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Mais" subtitle="Cartões, contas, relatórios e configurações" />
        <Card style={{ marginHorizontal: 20, paddingVertical: 4 }}>
          {ITENS.map((item, index) => (
            <MenuRow key={item.titulo} item={item} ultimo={index === ITENS.length - 1} />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
