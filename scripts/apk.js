// Gera o APK do Android no EAS Build (perfil "preview" do eas.json: instalação direta, sem loja,
// ligado ao canal "preview" do EAS Update — recebe o que o `npm run publicar` mandar).
// Define COFRE_PUBLICAR=1 para que o app.config.js inclua o projectId e o updates.url só aqui,
// sem mudar a identidade do app no Expo Go (seção 14 do CLAUDE.md). O iPhone continua no Expo Go.
// Uso: npm run apk
const { spawnSync } = require('child_process');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const args = ['eas-cli', 'build', '--platform', 'android', '--profile', 'preview'];

const resultado = spawnSync('npx', args, {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, COFRE_PUBLICAR: '1' },
});
if (resultado.error) {
  console.error(resultado.error.message);
}
process.exit(resultado.status ?? 1);
