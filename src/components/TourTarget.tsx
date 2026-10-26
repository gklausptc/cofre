import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';
import { useTourStore } from '@/store/tourStore';

type TourTargetProps = {
  id: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Envolve um elemento real da tela e o registra no tour como um "alvo" —
 * `TourOverlay` mede a posição via `measureInWindow` quando o passo chega nele.
 * `collapsable={false}` é necessário no Android pra essa View não sumir da
 * árvore nativa (o que quebraria a medição).
 */
export function TourTarget({ id, children, style }: TourTargetProps) {
  const ref = useRef<ViewInstance>(null);
  const registrarAlvo = useTourStore((s) => s.registrarAlvo);

  useEffect(() => {
    registrarAlvo(id, ref);
  }, [id, registrarAlvo]);

  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
