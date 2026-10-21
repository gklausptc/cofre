import React, { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarData, formatarDataHora } from '@/core/utils/date';
import { useImportacoesStore } from '@/store/importacoesStore';
import { useContasBancariasStore } from '@/store/contasBancariasStore';
import { useCartoesStore } from '@/store/cartoesStore';
import { NOMES_DOS_BANCOS } from '@/domain/usecases/importacao/bancos';
import type { BancoId } from '@/domain/usecases/importacao/tipos';

/** Todas as importações, da mais nova para a mais antiga; cada uma abre o resultado (com "Desfazer"). */
export default function HistoricoDeImportacoesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { importacoes, carregar } = useImportacoesStore();
  const { contas, carregar: carregarContas } = useContasBancariasStore();
  const { cartoes, carregar: carregarCartoes } = useCartoesStore();

  useFocusEffect(
    useCallback(() => {
      carregar();
      carregarContas();
      carregarCartoes();
    }, [carregar, carregarContas, carregarCartoes])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Importações" subtitle="Toque para ver o resultado ou desfazer" />
        {importacoes.length === 0 ? (
          <View style={{ gap: 12 }}>
            <EmptyState icon="upload" titulo="Nenhuma importação ainda" descricao="Importe o extrato da conta ou a fatura do cartão." />
            <View style={{ paddingHorizontal: 20 }}>
              <Button titulo="Importar extrato" onPress={() => router.push('/importar-extrato')} />
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 10 }}>
            {importacoes.map((imp) => {
              const destino =
                imp.contaBancariaId !== null
                  ? contas.find((c) => c.id === imp.contaBancariaId)?.nomeConta
                  : imp.cartaoId !== null
                    ? cartoes.find((c) => c.id === imp.cartaoId)?.nome
                    : 'Planilha do Cofre (várias contas)';
              const banco = imp.banco && imp.banco in NOMES_DOS_BANCOS ? NOMES_DOS_BANCOS[imp.banco as BancoId] : null;
              return (
                <Pressable
                  key={imp.id}
                  onPress={() => router.push({ pathname: '/importar-extrato/resultado', params: { id: String(imp.id) } })}
                  accessibilityRole="button"
                >
                  <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text className="font-body-medium" style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                        {imp.arquivo}
                      </Text>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={2}>
                        {formatarDataHora(imp.criadaEm)} · {[banco, destino].filter(Boolean).join(' · ')}
                      </Text>
                      <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12 }}>
                        {imp.importadas} {imp.importadas === 1 ? 'lançamento' : 'lançamentos'}
                        {imp.periodoInicio && imp.periodoFim ? ` de ${formatarData(imp.periodoInicio)} a ${formatarData(imp.periodoFim)}` : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
