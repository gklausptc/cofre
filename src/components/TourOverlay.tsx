import React, { useEffect, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { PASSOS_TOUR, useTourStore } from '@/store/tourStore';
import { Button } from '@/components/Button';

type Rect = { x: number; y: number; width: number; height: number };

const MARGEM_DESTAQUE = 8;
const FUNDO_ESCURECIDO = 'rgba(10, 13, 20, 0.72)';

/**
 * Tour guiado que aponta pra elementos reais da tela (não uma tela separada com
 * resumo/prints) — recorta um "buraco" no overlay escuro em cima do elemento
 * marcado com `TourTarget` e mostra uma dica ao lado.
 */
export function TourOverlay() {
  const { colors } = useAppTheme();
  const ativo = useTourStore((s) => s.ativo);
  const indice = useTourStore((s) => s.indice);
  const alvos = useTourStore((s) => s.alvos);
  const avancar = useTourStore((s) => s.avancar);
  const pular = useTourStore((s) => s.pular);

  const [rect, setRect] = useState<Rect | null>(null);
  const passo = PASSOS_TOUR[indice];

  useEffect(() => {
    if (!ativo) return;

    // pequeno atraso pra garantir que o layout nativo já processou o frame atual
    // antes de medir — measureInWindow chamado cedo demais pode devolver 0x0
    const handle = requestAnimationFrame(() => {
      const node = alvos[passo.id]?.current;
      if (!node) {
        // alvo ainda não está montado (ex.: escondido condicionalmente) — pula o passo
        avancar();
        return;
      }

      node.measureInWindow((x, y, width, height) => {
        if (width === 0 && height === 0) {
          avancar();
          return;
        }
        setRect({ x, y, width, height });
      });
    });

    return () => cancelAnimationFrame(handle);
  }, [ativo, indice, passo.id, alvos, avancar]);

  if (!ativo || !rect) return null;

  const { width: larguraTela, height: alturaTela } = Dimensions.get('window');
  const espacoAbaixo = alturaTela - (rect.y + rect.height);
  const tooltipAbaixo = espacoAbaixo > 200;

  const topoDestaque = Math.max(rect.y - MARGEM_DESTAQUE, 0);
  const alturaDestaque = rect.height + MARGEM_DESTAQUE * 2;
  const esquerdaDestaque = Math.max(rect.x - MARGEM_DESTAQUE, 0);
  const larguraDestaque = rect.width + MARGEM_DESTAQUE * 2;

  const ultimoPasso = indice === PASSOS_TOUR.length - 1;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
      {/* quatro faixas escuras ao redor do elemento em destaque */}
      <View
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: topoDestaque, backgroundColor: FUNDO_ESCURECIDO }}
      />
      <View
        style={{
          position: 'absolute',
          top: topoDestaque + alturaDestaque,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: FUNDO_ESCURECIDO,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: topoDestaque,
          left: 0,
          width: esquerdaDestaque,
          height: alturaDestaque,
          backgroundColor: FUNDO_ESCURECIDO,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: topoDestaque,
          left: esquerdaDestaque + larguraDestaque,
          right: 0,
          height: alturaDestaque,
          backgroundColor: FUNDO_ESCURECIDO,
        }}
      />
      {/* contorno do destaque */}
      <View
        style={{
          position: 'absolute',
          top: topoDestaque,
          left: esquerdaDestaque,
          width: larguraDestaque,
          height: alturaDestaque,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: colors.brand,
        }}
      />

      <View
        style={[
          { position: 'absolute', left: 16, right: 16 },
          tooltipAbaixo
            ? { top: Math.min(topoDestaque + alturaDestaque + 12, alturaTela - 60) }
            : { bottom: Math.min(alturaTela - topoDestaque + 12, alturaTela - 60) },
        ]}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 18,
            maxWidth: larguraTela - 32,
          }}
        >
          <Text className="font-body-medium" style={{ color: colors.brand, fontSize: 11, marginBottom: 6 }}>
            PASSO {indice + 1} DE {PASSOS_TOUR.length}
          </Text>
          <Text className="font-heading-medium" style={{ color: colors.text, fontSize: 16, marginBottom: 6 }}>
            {passo.titulo}
          </Text>
          <Text className="font-body" style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
            {passo.descricao}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={pular}>
              <Text className="font-body-medium" style={{ color: colors.textMuted, fontSize: 13 }}>
                Pular
              </Text>
            </Pressable>
            <Button titulo={ultimoPasso ? 'Concluir' : 'Próximo'} onPress={avancar} style={{ paddingHorizontal: 24 }} />
          </View>
        </View>
      </View>
    </View>
  );
}
