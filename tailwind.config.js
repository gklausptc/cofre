/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cofre — identidade visual (ver src/core/theme/colors.ts para a fonte única de verdade)
        brand: {
          DEFAULT: '#2A5CE0',
          dark: '#1A3FA8',
          light: '#5B8CFF',
        },
        accent: {
          DEFAULT: '#06B6D4',
          light: '#22D3EE',
        },
        danger: '#E5484D',
        surface: {
          light: '#F2F4F8',
          dark: '#0A0D14',
        },
        card: {
          light: '#FFFFFF',
          dark: '#141926',
        },
        border: {
          light: '#E1E5EC',
          dark: '#242B3D',
        },
        ink: {
          light: '#0F1320',
          dark: '#EEF1F8',
        },
        muted: {
          light: '#666E7E',
          dark: '#8891A6',
        },
      },
      fontFamily: {
        heading: ['Manrope_700Bold'],
        'heading-medium': ['Manrope_600SemiBold'],
        body: ['Manrope_400Regular'],
        'body-medium': ['Manrope_500Medium'],
      },
      borderRadius: {
        card: '16px',
        control: '12px',
      },
    },
  },
  plugins: [],
};
