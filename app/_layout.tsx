import '@/core/theme/global.css';

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '@/data/db/client';
import migrations from '@/data/db/migrations/migrations';
import { seedCategoriasPadrao } from '@/data/db/seed';
import { ThemeProvider, useAppTheme } from '@/core/theme/ThemeProvider';
import { listarContasFixas } from '@/data/repositories/contasFixasRepository';
import { listarParcelas, inserirParcelas } from '@/data/repositories/parcelasRepository';
import { listarCartoes } from '@/data/repositories/cartoesRepository';
import { listarComprasParceladas } from '@/data/repositories/comprasParceladasRepository';
import { listarMovimentacoes, inserirMovimentacoes } from '@/data/repositories/movimentacoesRepository';
import { gerarRecorrencia } from '@/domain/usecases/gerarRecorrencia';
import { gerarReceitasRecorrentes } from '@/domain/usecases/gerarReceitasRecorrentes';
import { calcularNotificacoesVencimento } from '@/domain/usecases/calcularNotificacoesVencimento';
import { configurarNotificacoes, agendarNotificacoesVencimento } from '@/core/notifications/notificationService';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { useBloqueioStore } from '@/store/bloqueioStore';
import { AppLockScreen } from '@/components/AppLockScreen';

async function rodarRecorrenciaDoDia() {
  const [contasFixas, parcelasExistentes] = await Promise.all([listarContasFixas(), listarParcelas()]);
  const novasParcelas = gerarRecorrencia(contasFixas, parcelasExistentes);
  await inserirParcelas(novasParcelas);

  const movimentacoesExistentes = await listarMovimentacoes();
  const novasMovimentacoes = gerarReceitasRecorrentes(movimentacoesExistentes);
  await inserirMovimentacoes(novasMovimentacoes);
}

async function agendarLembretesDoDia() {
  const [contasFixas, cartoes, comprasParceladas, parcelas] = await Promise.all([
    listarContasFixas(),
    listarCartoes(),
    listarComprasParceladas(),
    listarParcelas(),
  ]);
  const parcelasPendentes = parcelas.filter((p) => p.status === 'pendente');
  const itens = calcularNotificacoesVencimento(contasFixas, cartoes, comprasParceladas, parcelasPendentes);
  await configurarNotificacoes();
  await agendarNotificacoesVencimento(itens);
}

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { colors, scheme } = useAppTheme();
  const { success: migrationsOk, error: migrationsError } = useMigrations(db, migrations);
  const [inicializado, setInicializado] = useState(false);
  const { preferencias, carregar: carregarPreferencias } = usePreferenciasStore();
  const desbloqueado = useBloqueioStore((s) => s.desbloqueado);

  useEffect(() => {
    if (!migrationsOk) return;
    seedCategoriasPadrao(db)
      .then(() => rodarRecorrenciaDoDia())
      .then(() => carregarPreferencias())
      .then(() => setInicializado(true))
      .then(() => agendarLembretesDoDia())
      .catch((err) => console.error('Falha ao inicializar o app', err));
  }, [migrationsOk, carregarPreferencias]);

  const pronto = migrationsOk && inicializado;

  useEffect(() => {
    if (pronto || migrationsError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [pronto, migrationsError]);

  if (migrationsError) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}
      >
        <Text style={{ color: colors.danger, textAlign: 'center' }}>
          Erro ao preparar o banco de dados local: {migrationsError.message}
        </Text>
      </View>
    );
  }

  if (!pronto) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (preferencias?.bloqueioAtivo && !desbloqueado) {
    return (
      <>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <AppLockScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="gasto-rapido" options={{ presentation: 'modal', headerShown: true, title: 'Gasto rápido' }} />
        <Stack.Screen name="gasto-rapido/[id]" options={{ headerShown: true, title: 'Editar gasto' }} />
        <Stack.Screen name="movimentacao/novo" options={{ presentation: 'modal', headerShown: true, title: 'Nova movimentação' }} />
        <Stack.Screen name="movimentacao/[id]" options={{ headerShown: true, title: 'Editar movimentação' }} />
        <Stack.Screen name="conta-bancaria/index" options={{ headerShown: true, title: 'Contas bancárias' }} />
        <Stack.Screen name="conta-bancaria/novo" options={{ headerShown: true, title: 'Nova conta bancária' }} />
        <Stack.Screen name="conta-bancaria/[id]" options={{ headerShown: true, title: 'Conta bancária' }} />
        <Stack.Screen name="conta-fixa/index" options={{ headerShown: true, title: 'Contas fixas' }} />
        <Stack.Screen name="conta-fixa/novo" options={{ headerShown: true, title: 'Nova conta fixa' }} />
        <Stack.Screen name="conta-fixa/[id]" options={{ headerShown: true, title: 'Conta fixa' }} />
        <Stack.Screen name="cartao/novo" options={{ headerShown: true, title: 'Novo cartão' }} />
        <Stack.Screen name="cartao/[id]" options={{ headerShown: true, title: 'Cartão' }} />
        <Stack.Screen name="compra-parcelada/novo" options={{ headerShown: true, title: 'Nova compra parcelada' }} />
        <Stack.Screen name="compra-parcelada/[id]" options={{ headerShown: true, title: 'Editar compra parcelada' }} />
        <Stack.Screen name="cofrinho/index" options={{ headerShown: true, title: 'Cofrinhos' }} />
        <Stack.Screen name="cofrinho/novo" options={{ headerShown: true, title: 'Novo cofrinho' }} />
        <Stack.Screen name="cofrinho/[id]" options={{ headerShown: true, title: 'Cofrinho' }} />
        <Stack.Screen name="membro/index" options={{ headerShown: true, title: 'Membros da família' }} />
        <Stack.Screen name="membro/novo" options={{ headerShown: true, title: 'Novo membro' }} />
        <Stack.Screen name="reserva-emergencia/index" options={{ headerShown: true, title: 'Reserva de emergência' }} />
        <Stack.Screen name="relatorios/index" options={{ headerShown: true, title: 'Relatórios' }} />
        <Stack.Screen name="importar-extrato/index" options={{ headerShown: true, title: 'Importar extrato' }} />
        <Stack.Screen name="exportar-extrato/index" options={{ headerShown: true, title: 'Exportar extrato' }} />
        <Stack.Screen name="configuracoes/index" options={{ headerShown: true, title: 'Configurações' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
