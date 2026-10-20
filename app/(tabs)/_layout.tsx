import React from 'react';
import { Pressable, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';

/** Botão (+) do meio: abre a folha de ações em vez de trocar de aba. */
function BotaoMais() {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable
        onPress={() => router.push('/acoes')}
        accessibilityRole="button"
        accessibilityLabel="Lançar: gasto, entrada, transferência, compra parcelada ou importar extrato"
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: -14,
          borderWidth: 3,
          borderColor: colors.card,
        }}
      >
        <Feather name="plus" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/**
 * Cinco abas: Início · Extrato · (+) · Agenda · Metas. Cartões, Planejamento e Mais viraram
 * telas (abrem pelo Início); Pagamentos está inteira dentro da Agenda.
 */
export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: 'Manrope_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="lancamentos"
        options={{
          title: 'Extrato',
          tabBarIcon: ({ color, size }) => <Feather name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="novo"
        options={{
          title: 'Lançar',
          tabBarButton: () => <BotaoMais />,
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="metas"
        options={{
          title: 'Metas',
          tabBarIcon: ({ color, size }) => <Feather name="target" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="pagamentos" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
