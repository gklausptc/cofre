import React, { useEffect, useRef } from 'react';
import { Pressable, type View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useTourStore } from '@/store/tourStore';

type FabButtonProps = {
  /** Se definido, registra o botão como alvo do tour guiado (ver `TourTarget`). */
  tourId?: string;
};

export function FabButton({ tourId }: FabButtonProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const ref = useRef<View>(null);
  const registrarAlvo = useTourStore((s) => s.registrarAlvo);

  useEffect(() => {
    if (tourId) registrarAlvo(tourId, ref);
  }, [tourId, registrarAlvo]);

  return (
    <Pressable
      ref={ref}
      onPress={() => router.push('/gasto-rapido')}
      style={{
        position: 'absolute',
        right: 20,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
    >
      <Feather name="plus" size={26} color="#FFFFFF" />
    </Pressable>
  );
}
