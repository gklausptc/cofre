// Marca "Cofre Klaus": um "K" claro desenhado como porta de cofre — a haste é a
// dobradiça (com as duas presilhas do lado), os braços abrem como a porta, e o ponto
// ciano no encontro é o segredo do cofre. Usado por generate-brand-assets.js e espelhado
// em src/components/Logo.tsx (mesma geometria, viewBox 0 0 1024 1024).

const AZUL = '#2A5CE0';
const AZUL_ESCURO = '#1A3FA8';
const CIANO = '#06B6D4';
const CLARO = '#F7F9FC';

/** Desenho do glifo (sem fundo), centrado no quadro de 1024, na escala `escala` (1 = ícone). */
function glifo({ cor = CLARO, acento = CIANO, escala = 1, anel = AZUL_ESCURO, contorno = AZUL } = {}) {
  const t = (v) => 512 + (v - 512) * escala;
  const largura = 112 * escala;
  return `
    ${anel ? `<circle cx="512" cy="512" r="${352 * escala}" fill="none" stroke="${anel}" stroke-width="${44 * escala}"/>` : ''}
    <rect x="${t(318)}" y="${t(300)}" width="${largura}" height="${424 * escala}" rx="${30 * escala}" fill="${cor}"/>
    <rect x="${t(284)}" y="${t(356)}" width="${40 * escala}" height="${64 * escala}" rx="${12 * escala}" fill="${cor}"/>
    <rect x="${t(284)}" y="${t(604)}" width="${40 * escala}" height="${64 * escala}" rx="${12 * escala}" fill="${cor}"/>
    <line x1="${t(470)}" y1="${t(500)}" x2="${t(686)}" y2="${t(318)}" stroke="${cor}" stroke-width="${largura}" stroke-linecap="round"/>
    <line x1="${t(486)}" y1="${t(512)}" x2="${t(700)}" y2="${t(706)}" stroke="${cor}" stroke-width="${largura}" stroke-linecap="round"/>
    <circle cx="${t(452)}" cy="${t(512)}" r="${62 * escala}" fill="${acento}" stroke="${contorno}" stroke-width="${18 * escala}"/>
  `;
}

/** Ícone completo: fundo azul (o iOS arredonda sozinho) + glifo. */
function svgIcone({ fundo = AZUL, escala = 1, arredondar = false } = {}) {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" rx="${arredondar ? 228 : 0}" fill="${fundo}"/>
    ${glifo({ escala })}
  </svg>`;
}

/** Só o glifo, sem fundo (splash, Android adaptativo). `fundoDoDisco` desenha o disco azul atrás. */
function svgGlifo({ escala = 1, cor = CLARO, acento = CIANO, comDisco = true, contorno = AZUL } = {}) {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    ${comDisco ? `<circle cx="512" cy="512" r="${420 * escala}" fill="${AZUL}"/>` : ''}
    ${glifo({ escala, cor, acento, contorno, anel: comDisco ? AZUL_ESCURO : null })}
  </svg>`;
}

module.exports = { AZUL, AZUL_ESCURO, CIANO, CLARO, glifo, svgIcone, svgGlifo };
