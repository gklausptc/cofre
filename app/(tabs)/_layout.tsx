import React from 'react';
import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useFolhaDeAcoes } from '@/components/FolhaDeAcoes';

/**
 * Botão (+) do meio: abre a folha de ações em vez de trocar de aba. A folha é um Modal do
 * React Native (a folha nativa "formSheet" abria em branco no iPhone).
 */
function BotaoMais() {
  const { colors } = useAppTheme();
  const { abrir, folha } = useFolhaDeAcoes();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {folha}
      <Pressable
        onPress={abrir}
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
          tabBarIcon: ({ focused, size }) => <Feather name="home" size={size} color={focused ? colors.brand : colors.textMuted} />,
        }}
      />
      <Tabs.Screen
        name="lancamentos"
        options={{
          title: 'Extrato',
          tabBarIcon: ({ focused, size }) => <Feather name="list" size={size} color={focused ? colors.brand : colors.textMuted} />,
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
          tabBarIcon: ({ focused, size }) => <Feather name="calendar" size={size} color={focused ? colors.brand : colors.textMuted} />,
        }}
      />
      <Tabs.Screen
        name="metas"
        options={{
          title: 'Metas',
          tabBarIcon: ({ focused, size }) => <Feather name="target" size={size} color={focused ? colors.brand : colors.textMuted} />,
        }}
      />
      <Tabs.Screen name="pagamentos" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
