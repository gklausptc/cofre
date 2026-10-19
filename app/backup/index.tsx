import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatarDataHora } from '@/core/utils/date';
import { listarBackupsAutomaticos, type BackupAutomaticoNoAparelho } from '@/core/backup/arquivosBackup';
import {
  compartilharBackup,
  compartilharBackupAutomatico,
  escolherArquivoDeBackup,
  lerBackupDoArquivo,
  registrarBackupFeito,
  restaurarBackup,
  type BackupLido,
} from '@/core/backup/servicoBackup';
import { descreverIdadeBackup, type BackupCofre, type ItemResumoBackup } from '@/domain/usecases/backup';
import { usePreferenciasStore } from '@/store/preferenciasStore';

type Ocupado = 'backup' | 'escolher' | 'restaurar' | null;

type BackupEmPrevia = { backup: BackupCofre; resumo: ItemResumoBackup[]; origem: string };

const ROTULO_MOTIVO: Record<BackupAutomaticoNoAparelho['motivo'], string> = {
  'antes-da-atualizacao': 'Antes de uma atualização do app',
  'antes-de-restaurar': 'Antes de uma restauração',
};

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export default function BackupScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { preferencias, carregar: carregarPreferencias } = usePreferenciasStore();

  const [automaticos, setAutomaticos] = useState<BackupAutomaticoNoAparelho[]>([]);
  const [previa, setPrevia] = useState<BackupEmPrevia | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [erro, setErro] = useState<string | null>(null);
  const rolagem = useRef<ScrollView>(null);

  const recarregarAutomaticos = useCallback(() => {
    try {
      setAutomaticos(listarBackupsAutomaticos());
    } catch {
      setAutomaticos([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarPreferencias();
      recarregarAutomaticos();
    }, [carregarPreferencias, recarregarAutomaticos])
  );

  const idade = descreverIdadeBackup(preferencias?.ultimoBackupEm ?? null, new Date());

  async function handleFazerBackup() {
    setErro(null);
    setOcupado('backup');
    try {
      await compartilharBackup();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui gerar o backup. Tente de novo.');
      return;
    } finally {
      setOcupado(null);
    }

    Alert.alert(
      'O arquivo foi salvo?',
      'Se você salvou o backup fora do app (Arquivos, iCloud Drive, WhatsApp ou e-mail), toque em "Salvei" para o Cofre registrar a data.',
      [
        { text: 'Não salvei', style: 'cancel' },
        {
          text: 'Salvei',
          onPress: async () => {
            await registrarBackupFeito();
            await carregarPreferencias();
          },
        },
      ]
    );
  }

  function mostrarPrevia(lido: BackupLido, origem: string) {
    if (!lido.ok) {
      setErro(lido.erro);
      setPrevia(null);
      return;
    }
    setPrevia({ backup: lido.backup, resumo: lido.resumo, origem });
    rolagem.current?.scrollTo({ y: 0, animated: true });
  }

  async function handleEscolherArquivo() {
    setErro(null);
    setOcupado('escolher');
    try {
      const lido = await escolherArquivoDeBackup();
      if (lido) mostrarPrevia(lido, 'Arquivo escolhido');
    } catch {
      setErro('Não consegui abrir esse arquivo.');
    } finally {
      setOcupado(null);
    }
  }

  async function handleAbrirAutomatico(item: BackupAutomaticoNoAparelho) {
    setErro(null);
    setOcupado('escolher');
    try {
      mostrarPrevia(await lerBackupDoArquivo(item.uri), ROTULO_MOTIVO[item.motivo]);
    } finally {
      setOcupado(null);
    }
  }

  async function handleCompartilharAutomatico(item: BackupAutomaticoNoAparelho) {
    setErro(null);
    try {
      await compartilharBackupAutomatico(item.uri);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui compartilhar essa cópia.');
    }
  }

  async function executarRestauracao(backup: BackupCofre) {
    setOcupado('restaurar');
    try {
      await restaurarBackup(backup);
    } catch {
      setErro('Não consegui restaurar o backup. Seus dados atuais não foram alterados.');
      return;
    } finally {
      setOcupado(null);
    }

    setPrevia(null);
    await carregarPreferencias();
    Alert.alert('Backup restaurado', 'Seus dados agora são os do backup.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)/dashboard') },
    ]);
  }

  function handleConfirmarRestauracao() {
    if (!previa) return;
    const { backup } = previa;
    Alert.alert(
      'Substituir todos os dados?',
      'Tudo o que está no app agora será trocado pelo conteúdo do backup. Uma cópia dos dados atuais fica guardada em "Cópias automáticas", nesta tela.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Substituir', style: 'destructive', onPress: () => executarRestauracao(backup) },
      ]
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView ref={rolagem} contentContainerStyle={{ paddingBottom: 40 }}>
        <ScreenHeader title="Backup" subtitle="Guarde e recupere todos os seus dados" />

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {erro && (
            <Card style={{ borderColor: colors.danger }}>
              <Text className="font-body-medium" style={{ color: colors.danger, fontSize: 13 }}>
                {erro}
              </Text>
            </Card>
          )}

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
              Fazer backup
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {idade.precisaLembrar && <Feather name="alert-circle" size={14} color={colors.warning} />}
              <Text
                className="font-body-medium"
                style={{ color: idade.precisaLembrar ? colors.warning : colors.textMuted, fontSize: 13 }}
              >
                {idade.texto}
              </Text>
            </View>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
              Gera um arquivo com todos os seus dados para você salvar fora do app (Arquivos, iCloud Drive,
              WhatsApp ou e-mail). Se o Expo Go for apagado, os dados do app vão junto, menos o que estiver nesse
              arquivo. O PIN de bloqueio não vai no backup.
            </Text>
            <Button titulo="Fazer backup agora" onPress={handleFazerBackup} carregando={ocupado === 'backup'} />
          </Card>

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
              Restaurar backup
            </Text>

            {previa ? (
              <View>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                  {previa.origem} · feito em {formatarDataHora(previa.backup.criadoEm)}
                </Text>
                <View style={{ gap: 4, marginBottom: 12 }}>
                  {previa.resumo.length === 0 ? (
                    <Text className="font-body" style={{ color: colors.text, fontSize: 14 }}>
                      Nenhum lançamento, conta ou cartão cadastrado.
                    </Text>
                  ) : (
                    previa.resumo.map((item) => (
                      <Text key={item.rotulo} className="font-body" style={{ color: colors.text, fontSize: 14 }}>
                        <Text className="font-heading-medium">{item.quantidade}</Text> {item.rotulo}
                      </Text>
                    ))
                  )}
                </View>
                <Text className="font-body-medium" style={{ color: colors.warning, fontSize: 12, marginBottom: 16 }}>
                  Restaurar substitui todos os dados que estão no app agora.
                </Text>
                <View style={{ gap: 12 }}>
                  <Button
                    titulo="Substituir meus dados"
                    variante="perigo"
                    onPress={handleConfirmarRestauracao}
                    carregando={ocupado === 'restaurar'}
                  />
                  <Button
                    titulo="Cancelar"
                    variante="secundaria"
                    onPress={() => setPrevia(null)}
                    disabled={ocupado === 'restaurar'}
                  />
                </View>
              </View>
            ) : (
              <View>
                <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 16 }}>
                  Escolha um arquivo de backup do Cofre. Antes de trocar qualquer coisa, o app mostra o que tem no
                  arquivo e pede confirmação.
                </Text>
                <Button
                  titulo="Escolher arquivo de backup"
                  variante="secundaria"
                  onPress={handleEscolherArquivo}
                  carregando={ocupado === 'escolher'}
                />
              </View>
            )}
          </Card>

          <Card>
            <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 15, marginBottom: 4 }}>
              Cópias automáticas
            </Text>
            <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              O app guarda sozinho uma cópia antes de cada atualização do banco e antes de cada restauração (as 5
              mais recentes). Elas ficam dentro do Expo Go.
            </Text>
            {automaticos.length === 0 ? (
              <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 8 }}>
                Nenhuma cópia ainda.
              </Text>
            ) : (
              automaticos.map((item, index) => (
                <View
                  key={item.nome}
                  style={{
                    paddingVertical: 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text className="font-body-medium" style={{ color: colors.text, fontSize: 14 }}>
                    {ROTULO_MOTIVO[item.motivo]}
                  </Text>
                  <Text className="font-body" style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {formatarDataHora(item.criadoEm)} · {formatarTamanho(item.tamanhoBytes)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
                    <Pressable
                      onPress={() => handleAbrirAutomatico(item)}
                      disabled={ocupado !== null}
                      style={{ minHeight: 44, justifyContent: 'center' }}
                    >
                      <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
                        Restaurar esta
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleCompartilharAutomatico(item)}
                      style={{ minHeight: 44, justifyContent: 'center' }}
                    >
                      <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
                        Compartilhar
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
