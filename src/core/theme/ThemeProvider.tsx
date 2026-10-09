import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferenciasStore } from '@/store/preferenciasStore';
import { darkTheme, lightTheme, type ThemeColors } from './colors';

type ThemeContextValue = {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const temaPreferido = usePreferenciasStore((s) => s.preferencias?.tema ?? 'sistema');

  const scheme =
    temaPreferido === 'sistema'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : temaPreferido === 'escuro'
        ? 'dark'
        : 'light';

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: scheme === 'dark' ? darkTheme : lightTheme,
      scheme,
    }),
    [scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}
