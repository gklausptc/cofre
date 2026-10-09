const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '../assets');

const GRAPHITE = '#0A0D14';
const BLUE = '#2A5CE0';
const BLUE_LIGHT = '#5B8CFF';
const CYAN = '#06B6D4';
const WHITE = '#FFFFFF';

// Marca "Cofre": um "chip" — corpo arredondado com um pad de contato inset no
// canto superior esquerdo. Abstrato, geométrico, remete a hardware/tech em vez
// de um ícone financeiro literal.
function svgChip({ bg, bodyColor, padColor, bodySize }) {
  const half = bodySize / 2;
  const x = 512 - half;
  const y = 512 - half;
  const rx = bodySize * 0.2;
  const padSize = bodySize * 0.32;
  const padX = x + bodySize * 0.14;
  const padY = y + bodySize * 0.14;
  const padRx = padSize * 0.28;

  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}
    <rect x="${x}" y="${y}" width="${bodySize}" height="${bodySize}" rx="${rx}" fill="${bodyColor}"/>
    <rect x="${padX}" y="${padY}" width="${padSize}" height="${padSize}" rx="${padRx}" fill="${padColor}"/>
  </svg>`;
}

async function render(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log('wrote', outPath);
}

// Versão monocromática (silhueta única) para o ícone temático do Android —
// funde corpo + pad numa única forma vazada.
function svgChipMonocromo({ fill, bodySize }) {
  const half = bodySize / 2;
  const x = 512 - half;
  const y = 512 - half;
  const rx = bodySize * 0.2;
  const padSize = bodySize * 0.32;
  const padX = x + bodySize * 0.14;
  const padY = y + bodySize * 0.14;
  const padRx = padSize * 0.28;

  return `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <mask id="m">
      <rect width="1024" height="1024" fill="black"/>
      <rect x="${x}" y="${y}" width="${bodySize}" height="${bodySize}" rx="${rx}" fill="white"/>
    </mask>
    <rect width="1024" height="1024" fill="${fill}" mask="url(#m)"/>
    <rect x="${padX}" y="${padY}" width="${padSize}" height="${padSize}" rx="${padRx}" fill="${fill}" opacity="0.55"/>
  </svg>`;
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

  // Ícone principal: fundo grafite, corpo azul, pad ciano
  await render(
    svgChip({ bg: GRAPHITE, bodyColor: BLUE, padColor: CYAN, bodySize: 620 }),
    path.join(ASSETS_DIR, 'icon.png'),
    1024
  );

  // Android adaptive icon — foreground (transparente, dentro da safe zone)
  await render(
    svgChip({ bg: null, bodyColor: BLUE, padColor: CYAN, bodySize: 460 }),
    path.join(ASSETS_DIR, 'android-icon-foreground.png'),
    1024
  );

  // Android adaptive icon — monochrome (silhueta branca única)
  await render(svgChipMonocromo({ fill: WHITE, bodySize: 460 }), path.join(ASSETS_DIR, 'android-icon-monochrome.png'), 1024);

  // Splash claro — mark sobre fundo claro
  await render(
    svgChip({ bg: null, bodyColor: BLUE, padColor: CYAN, bodySize: 620 }),
    path.join(ASSETS_DIR, 'splash-icon.png'),
    1024
  );

  // Splash escuro — corpo em azul claro para contraste no grafite
  await render(
    svgChip({ bg: null, bodyColor: BLUE_LIGHT, padColor: CYAN, bodySize: 620 }),
    path.join(ASSETS_DIR, 'splash-icon-dark.png'),
    1024
  );

  // Favicon web
  await render(
    svgChip({ bg: GRAPHITE, bodyColor: BLUE, padColor: CYAN, bodySize: 620 }),
    path.join(ASSETS_DIR, 'favicon.png'),
    256
  );

  console.log('Brand assets gerados em', ASSETS_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
