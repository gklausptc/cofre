// Publica o app no EAS Update (branch/canal "preview") para quem usa o app publicado.
// Define COFRE_PUBLICAR=1 para que o app.config.js inclua o projectId do EAS.
const { spawnSync } = require('child_process');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const mensagem = process.argv.slice(2).join(' ') || `Cofre ${new Date().toISOString().slice(0, 16)}`;

const resultado = spawnSync(
  'npx',
  ['eas-cli', 'update', '--branch', 'preview', '--environment', 'preview', '--message', mensagem, '--non-interactive'],
  { cwd: raiz, stdio: 'inherit', shell: true, env: { ...process.env, COFRE_PUBLICAR: '1' } }
);
process.exit(resultado.status ?? 1);
