// Identidade visual "Cofre" — fonte única de verdade das cores.
// Mantido em sincronia manual com tailwind.config.js (NativeWind não lê .ts em runtime nativo).
// Direção: fintech "tech" — azul elétrico + ciano sobre grafite, alto contraste.

export const palette = {
  brand: '#2A5CE0',
  brandDark: '#1A3FA8',
  brandLight: '#5B8CFF',
  accent: '#06B6D4',
  accentLight: '#22D3EE',
  // vermelho mais escuro que o antigo #E5484D — texto branco em cima do antigo
  // ficava com contraste ~3.9:1 (abaixo do mínimo de acessibilidade de 4.5:1),
  // o que deixava os botões "Remover" difíceis de ler no tema claro
  danger: '#D32F2F',
  white: '#FFFFFF',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  brand: string;
  brandDark: string;
  accent: string;
  danger: string;
  success: string;
};

export const lightTheme: ThemeColors = {
  background: '#F2F4F8',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  // um pouco mais escura que #E1E5EC — no branco puro, botões com fundo claro e
  // borda quase da mesma cor do fundo ficavam praticamente invisíveis
  border: '#CBD2E0',
  text: '#0F1320',
  textMuted: '#666E7E',
  brand: palette.brand,
  brandDark: palette.brandDark,
  accent: palette.accent,
  danger: palette.danger,
  success: palette.accent,
};

export const darkTheme: ThemeColors = {
  background: '#0A0D14',
  surface: '#141926',
  card: '#141926',
  border: '#242B3D',
  text: '#EEF1F8',
  textMuted: '#8891A6',
  brand: palette.brandLight,
  brandDark: palette.brand,
  accent: palette.accentLight,
  danger: palette.danger,
  success: palette.accentLight,
};
