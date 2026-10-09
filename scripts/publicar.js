// Publica o app no EAS Update (branch/canal "preview") para quem usa o app publicado.
// Define COFRE_PUBLICAR=1 para que o app.config.js inclua o projectId do EAS.
// Uso: npm run publicar -- "mensagem opcional"
const { spawnSync } = require('child_process');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const mensagem = process.argv.slice(2).join(' ') || `Cofre ${new Date().toISOString().slice(0, 16)}`;

// Com shell: true (necessário para o npx no Windows), argumentos com espaço precisam de aspas.
const aspas = (arg) => (/\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const args = ['eas-cli', 'update', '--branch', 'preview', '--environment', 'preview', '--message', mensagem, '--non-interactive'];

const resultado = spawnSync('npx', args.map(aspas), {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, COFRE_PUBLICAR: '1' },
});
if (resultado.error) {
  console.error(resultado.error.message);
}
process.exit(resultado.status ?? 1);
