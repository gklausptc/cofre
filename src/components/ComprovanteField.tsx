import React, { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { apagarComprovante, escolherFoto, guardarComprovante, uriDoComprovante, type OrigemDaFoto } from '@/core/comprovantes/comprovantes';
import { repositorios } from '@/domain/repositories';

type Props = {
  /** Caminho relativo salvo no lançamento (null = sem foto). */
  valor: string | null;
  onAlterar: (caminho: string | null) => void;
};

/** Foto do comprovante de um lançamento: tirar, escolher da galeria, ver e remover. */
export function ComprovanteField({ valor, onAlterar }: Props) {
  const { colors } = useAppTheme();
  const [trabalhando, setTrabalhando] = useState(false);
  const uri = uriDoComprovante(valor);

  async function adicionar(origem: OrigemDaFoto) {
    setTrabalhando(true);
    try {
      const foto = await escolherFoto(origem);
      if (!foto) return;
      const caminho = await guardarComprovante(foto);
      if (valor) apagarComprovante(valor);
      onAlterar(caminho);
      // aviso único: as fotos ficam só no aparelho
      const repos = repositorios();
      const preferencias = await repos.preferencias.buscarPreferencias();
      const avisos = preferencias.insightsDispensados ? (JSON.parse(preferencias.insightsDispensados) as string[]) : [];
      if (!avisos.includes('aviso-comprovante')) {
        await repos.preferencias.atualizarPreferencias({ insightsDispensados: JSON.stringify([...avisos, 'aviso-comprovante']) });
        Alert.alert('Comprovante guardado', 'A foto fica só neste aparelho e não entra no backup.');
      }
    } catch {
      Alert.alert('Não consegui guardar a foto', 'Tente de novo.');
    } finally {
      setTrabalhando(false);
    }
  }

  function remover() {
    Alert.alert('Remover o comprovante?', 'A foto é apagada do aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          apagarComprovante(valor);
          onAlterar(null);
        },
      },
    ]);
  }

  const botao = (icone: React.ComponentProps<typeof Feather>['name'], rotulo: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={trabalhando}
      accessibilityRole="button"
      style={{
        flex: 1,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        opacity: trabalhando ? 0.5 : 1,
      }}
    >
      <Feather name={icone} size={16} color={colors.brand} />
      <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 13 }}>
        {rotulo}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ marginBottom: 16 }}>
      <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>
        Comprovante (opcional)
      </Text>
      {valor && uri && (
        <View style={{ marginBottom: 8 }}>
          <Image source={{ uri }} style={{ width: '100%', height: 220, borderRadius: 12 }} resizeMode="contain" accessibilityLabel="Foto do comprovante" />
        </View>
      )}
      {valor && !uri && (
        <Text className="font-body" style={{ color: colors.warning, fontSize: 12, marginBottom: 8 }}>
          Foto não encontrada neste aparelho.
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {botao('camera', 'Tirar foto', () => adicionar('camera'))}
        {botao('image', 'Da galeria', () => adicionar('galeria'))}
        {valor ? botao('trash-2', 'Remover', remover) : null}
      </View>
    </View>
  );
}
