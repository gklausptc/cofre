const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', 'scripts/*'],
  },
  {
    // Regra de camadas (CLAUDE.md, seção 4): telas, stores e componentes não acessam src/data.
    files: ['app/**/*.{ts,tsx}', 'src/store/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/data', '@/data/*', '**/data/db/*', '**/data/repositories/*'],
              message: 'Telas, stores e componentes não importam src/data: use src/domain/repositories ou um usecase.',
            },
          ],
        },
      ],
    },
  },
  {
    // Usecases são funções puras: não falam com banco nem com a interface.
    files: ['src/domain/usecases/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/data', '@/data/*'], message: 'Usecases são puros: recebem dados e devolvem dados.' },
            { group: ['react', 'react-native', '@/components/*', '@/store/*'], message: 'Usecases não importam React nem telas.' },
          ],
        },
      ],
    },
  },
]);
