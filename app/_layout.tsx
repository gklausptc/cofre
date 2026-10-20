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
import { ThemeProvider, useAppTheme } from '@/core/theme/ThemeProvider';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { useBloqueioStore } from '@/store/bloqueioStore';
import { AppLockScreen } from '@/components/AppLockScreen';
import { Button } from '@/components/Button';
import { RespostasDeNotificacao } from '@/components/RespostasDeNotificacao';
import { AvisoGlobal } from '@/components/AvisoGlobal';
import {
  agendarLembretesDoDia,
  inicializarRepositorios,
  prepararBanco,
  prepararDadosDoDia,
} from '@/core/inicializacao';

inicializarRepositorios();

SplashScreen.preventAutoHideAsync().catch(() => {});

function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function TelaDeErro({ titulo, mensagem, onTentarDeNovo }: { titulo: string; mensagem: string; onTentarDeNovo: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}
    >
      <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 17, textAlign: 'center', marginBottom: 8 }}>
        {titulo}
      </Text>
      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
        {mensagem}
      </Text>
      <Button titulo="Tentar de novo" onPress={onTentarDeNovo} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

function RootNavigator() {
  const { colors, scheme } = useAppTheme();
  const [migrationsOk, setMigrationsOk] = useState(false);
  const [migrationsError, setMigrationsError] = useState<string | null>(null);
  const [inicializado, setInicializado] = useState(false);
  const [erroInicializacao, setErroInicializacao] = useState<string | null>(null);
  // incrementado pelo botão "Tentar de novo" das telas de erro
  const [tentativa, setTentativa] = useState(0);
  const { preferencias, carregar: carregarPreferencias } = usePreferenciasStore();
  const desbloqueado = useBloqueioStore((s) => s.desbloqueado);

  function tentarDeNovo() {
    setMigrationsError(null);
    setErroInicializacao(null);
    setTentativa((n) => n + 1);
  }

  useEffect(() => {
    prepararBanco()
      .then(() => setMigrationsOk(true))
      .catch((erro: unknown) => setMigrationsError(mensagemDeErro(erro)));
  }, [tentativa]);

  useEffect(() => {
    if (!migrationsOk) return;
    prepararDadosDoDia()
      .then(() => carregarPreferencias())
      .then(() => {
        setInicializado(true);
        // lembretes não impedem o app de abrir
        agendarLembretesDoDia().catch((erro: unknown) => console.warn('Falha ao agendar lembretes', erro));
      })
      .catch((erro: unknown) => {
        console.error('Falha ao inicializar o app', erro);
        setErroInicializacao(mensagemDeErro(erro));
      });
  }, [migrationsOk, carregarPreferencias, tentativa]);

  const pronto = migrationsOk && inicializado;
  const temErro = migrationsError !== null || erroInicializacao !== null;

  useEffect(() => {
    if (pronto || temErro) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [pronto, temErro]);

  if (migrationsError !== null) {
    return (
      <TelaDeErro
        titulo="Não consegui preparar o banco de dados"
        mensagem={`${migrationsError}\n\nNenhuma alteração foi feita nos seus dados.`}
        onTentarDeNovo={tentarDeNovo}
      />
    );
  }

  if (erroInicializacao !== null) {
    return (
      <TelaDeErro
        titulo="Não consegui abrir o Cofre"
        mensagem={`Algo deu errado ao carregar seus dados: ${erroInicializacao}`}
        onTentarDeNovo={tentarDeNovo}
      />
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
      <RespostasDeNotificacao />
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
        <Stack.Screen name="cartoes" options={{ headerShown: true, title: 'Cartões' }} />
        <Stack.Screen name="planejamento" options={{ headerShown: true, title: 'Planejamento' }} />
        <Stack.Screen name="mais" options={{ headerShown: true, title: 'Mais' }} />
        <Stack.Screen name="acoes" options={{ presentation: 'modal', headerShown: true, title: 'Lançar' }} />
        <Stack.Screen name="cofrinho/index" options={{ headerShown: true, title: 'Cofrinhos' }} />
        <Stack.Screen name="cofrinho/novo" options={{ headerShown: true, title: 'Novo cofrinho' }} />
        <Stack.Screen name="cofrinho/[id]" options={{ headerShown: true, title: 'Cofrinho' }} />
        <Stack.Screen name="membro/index" options={{ headerShown: true, title: 'Membros da família' }} />
        <Stack.Screen name="membro/novo" options={{ headerShown: true, title: 'Novo membro' }} />
        <Stack.Screen name="reserva-emergencia/index" options={{ headerShown: true, title: 'Reserva de emergência' }} />
        <Stack.Screen name="relatorios/index" options={{ headerShown: true, title: 'Relatórios' }} />
        <Stack.Screen name="relatorios/anual" options={{ headerShown: true, title: 'Relatório do ano' }} />
        <Stack.Screen name="importar-extrato/index" options={{ headerShown: true, title: 'Importar extrato' }} />
        <Stack.Screen name="importar-extrato/resultado" options={{ headerShown: true, title: 'Resultado' }} />
        <Stack.Screen name="importar-extrato/historico" options={{ headerShown: true, title: 'Importações' }} />
        <Stack.Screen name="importar-extrato/lote" options={{ headerShown: true, title: 'Importar vários' }} />
        <Stack.Screen name="regras/index" options={{ headerShown: true, title: 'Regras aprendidas' }} />
        <Stack.Screen name="categorias/index" options={{ headerShown: true, title: 'Categorias' }} />
        <Stack.Screen name="revisao/index" options={{ headerShown: true, title: 'Revisão' }} />
        <Stack.Screen name="exportar-extrato/index" options={{ headerShown: true, title: 'Exportar extrato' }} />
        <Stack.Screen name="configuracoes/index" options={{ headerShown: true, title: 'Configurações' }} />
        <Stack.Screen name="backup/index" options={{ headerShown: true, title: 'Backup e restauração' }} />
        <Stack.Screen name="configuracoes/taxas" options={{ headerShown: true, title: 'Taxas de referência' }} />
        <Stack.Screen name="configuracoes/notificacoes" options={{ headerShown: true, title: 'Notificações' }} />
        <Stack.Screen name="configuracoes/divisao-salario" options={{ headerShown: true, title: 'Divisão do salário' }} />
        <Stack.Screen name="orcamento/index" options={{ headerShown: true, title: 'Orçamento' }} />
        <Stack.Screen name="assinaturas/index" options={{ headerShown: true, title: 'Assinaturas' }} />
        <Stack.Screen name="fechamento-mes/index" options={{ headerShown: true, title: 'Fechamento do mês' }} />
        <Stack.Screen name="busca/index" options={{ headerShown: true, title: 'Buscar' }} />
        <Stack.Screen name="simulador/index" options={{ headerShown: true, title: 'Dá para comprar?' }} />
        <Stack.Screen name="simulador/quitacao" options={{ headerShown: true, title: 'Adiantar parcelas' }} />
      </Stack>
      <AvisoGlobal />
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
