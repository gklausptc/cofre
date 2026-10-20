import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { SwitchRow } from '@/components/SwitchRow';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import {
  notificacoesIndisponiveis,
  notificarImediatamente,
  pedirPermissao,
  situacaoDaPermissao,
  type SituacaoDaPermissao,
} from '@/core/notifications/notificationService';
import { reagendarTodas } from '@/core/notifications/agendador';
import {
  DESCRICAO_DOS_TIPOS,
  lerConfigNotificacoes,
  type ConfigDoTipo,
  type ConfigNotificacoes,
  type TipoNotificacao,
} from '@/domain/usecases/notificacoes/configNotificacoes';

/** Ordem na tela: primeiro o que avisa de dinheiro a pagar. */
const ORDEM: TipoNotificacao[] = [
  'vencimento_conta_fixa',
  'vencimento_fatura',
  'fechamento_fatura',
  'conta_atrasada',
  'recorrencia_importada',
  'parcela_mes',
  'orcamento',
  'meta_cofrinho',
  'fechamento_mes',
  'resumo_semanal',
  'lembrete_importacao',
  'lembrete_backup',
];

const ANTECEDENCIAS: { valor: string; rotulo: string; dias: number[] }[] = [
  { valor: 'dia', rotulo: 'No dia', dias: [0] },
  { valor: '1', rotulo: '1 dia antes', dias: [1] },
  { valor: '2+0', rotulo: '2 dias antes e no dia', dias: [2, 0] },
  { valor: '3+0', rotulo: '3 dias antes e no dia', dias: [3, 0] },
];
const COM_ANTECEDENCIA: TipoNotificacao[] = ['vencimento_conta_fixa', 'vencimento_fatura', 'fechamento_fatura'];
const COM_INTERVALO: TipoNotificacao[] = ['lembrete_importacao', 'lembrete_backup'];
const INTERVALOS = [3, 7, 14, 30];

function valorDaAntecedencia(dias: number[] | undefined): string {
  const chave = (dias ?? [0]).join('+');
  return ANTECEDENCIAS.find((a) => a.dias.join('+') === chave)?.valor ?? '2+0';
}

export default function NotificacoesScreen() {
  const { colors } = useAppTheme();
  const { preferencias, carregar, atualizar } = usePreferenciasStore();
  const [permissao, setPermissao] = useState<SituacaoDaPermissao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregar();
      situacaoDaPermissao().then(setPermissao);
    }, [carregar])
  );

  const config = lerConfigNotificacoes(preferencias?.configNotificacoes ?? null);

  async function mudar(tipo: TipoNotificacao, parcial: Partial<ConfigDoTipo>) {
    const nova: ConfigNotificacoes = { ...config, [tipo]: { ...config[tipo], ...parcial } };
    await atualizar({ configNotificacoes: JSON.stringify(nova) });
  }

  async function permitir() {
    const concedida = await pedirPermissao();
    setPermissao(await situacaoDaPermissao());
    await atualizar({ permissaoNotificacoesPedida: true });
    if (concedida) await reagendarTodas();
  }

  async function testar() {
    await notificarImediatamente('Notificação de teste', 'É assim que os lembretes do Cofre aparecem.');
    setAviso('Enviada. Se não apareceu, confira as notificações do Expo Go nos Ajustes do iPhone.');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Notificações" subtitle="Lembretes locais, sem internet" />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Card>
            {notificacoesIndisponiveis || permissao === 'indisponivel' ? (
              <Text className="font-body" style={{ color: colors.warning, fontSize: 13 }}>
                No Expo Go para Android as notificações não funcionam. No iPhone (Expo Go) e num app instalado, sim.
              </Text>
            ) : permissao === 'concedida' ? (
              <>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
                  Notificações permitidas. Nada é enviado entre 21h e 8h, e vencimentos do mesmo dia vêm juntos num aviso só.
                </Text>
                <Button titulo="Enviar uma de teste" variante="secundaria" onPress={testar} />
                {aviso && (
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
                    {aviso}
                  </Text>
                )}
              </>
            ) : permissao === 'negada' ? (
              <>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
                  As notificações estão desligadas para o app nos Ajustes do aparelho.
                </Text>
                <Button titulo="Abrir Ajustes" variante="secundaria" onPress={() => Linking.openSettings()} />
              </>
            ) : (
              <>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
                  Para receber os lembretes de vencimento, permita as notificações.
                </Text>
                <Button titulo="Permitir notificações" onPress={permitir} />
              </>
            )}
          </Card>

          {ORDEM.map((tipo) => {
            const atual = config[tipo];
            const { titulo, descricao } = DESCRICAO_DOS_TIPOS[tipo];
            return (
              <View key={tipo}>
                <SwitchRow titulo={titulo} descricao={descricao} valor={atual.ativo} onAlterar={(ativo) => mudar(tipo, { ativo })} />
                {atual.ativo && COM_ANTECEDENCIA.includes(tipo) && (
                  <View style={{ marginTop: -8 }}>
                    <ChipSelect
                      label="Quando avisar"
                      opcoes={ANTECEDENCIAS.map(({ valor, rotulo }) => ({ valor, rotulo }))}
                      valor={valorDaAntecedencia(atual.diasAntes)}
                      onSelecionar={(valor) => mudar(tipo, { diasAntes: ANTECEDENCIAS.find((a) => a.valor === valor)?.dias ?? [2, 0] })}
                    />
                  </View>
                )}
                {atual.ativo && COM_INTERVALO.includes(tipo) && (
                  <View style={{ marginTop: -8 }}>
                    <ChipSelect
                      label="Depois de quantos dias"
                      opcoes={INTERVALOS.map((d) => ({ valor: String(d), rotulo: `${d} dias` }))}
                      valor={String(atual.dias ?? 7)}
                      onSelecionar={(valor) => mudar(tipo, { dias: Number(valor) })}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
