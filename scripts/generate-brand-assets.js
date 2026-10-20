// Gera os ícones e o splash a partir da marca "Cofre Klaus" (scripts/marca-klaus.js).
// Uso: node scripts/generate-brand-assets.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { AZUL, svgIcone, svgGlifo } = require('./marca-klaus');

const ASSETS_DIR = path.resolve(__dirname, '../assets');
const BRANCO = '#FFFFFF';
const AZUL_CLARO = '#5B8CFF';

async function render(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log('wrote', outPath);
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

  // Ícone principal (iOS arredonda sozinho; sem transparência)
  await render(svgIcone({ fundo: AZUL }), path.join(ASSETS_DIR, 'icon.png'), 1024);

  // Android adaptativo: o fundo azul vem do app.json; o glifo fica na zona segura (~66%)
  await render(svgGlifo({ escala: 0.62, comDisco: false }), path.join(ASSETS_DIR, 'android-icon-foreground.png'), 1024);

  // Android monocromático: silhueta única branca (o sistema pinta)
  await render(
    svgGlifo({ escala: 0.62, comDisco: false, cor: BRANCO, acento: BRANCO, contorno: BRANCO }),
    path.join(ASSETS_DIR, 'android-icon-monochrome.png'),
    1024
  );

  // Splash: disco azul com o glifo, sobre o fundo claro ou escuro do app.json
  await render(svgGlifo({ escala: 0.9 }), path.join(ASSETS_DIR, 'splash-icon.png'), 1024);
  await render(
    svgGlifo({ escala: 0.9 }).replace(`fill="${AZUL}"/>`, `fill="${AZUL_CLARO}"/>`),
    path.join(ASSETS_DIR, 'splash-icon-dark.png'),
    1024
  );

  // Favicon web
  await render(svgIcone({ fundo: AZUL, arredondar: true }), path.join(ASSETS_DIR, 'favicon.png'), 256);

  console.log('Marca gerada em', ASSETS_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
