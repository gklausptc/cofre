/**
 * Dinheiro no Cofre é sempre um número inteiro de CENTAVOS (R$ 12,34 = 1234), do banco até
 * as telas. Reais com casas decimais só existem na hora de exibir ou de ler texto digitado/
 * importado — e essas conversões passam por aqui.
 */
export type Centavos = number;

const formatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** "R$ 1.234,56" */
export function formatarMoeda(centavos: Centavos): string {
  return formatter.format(centavos / 100);
}

/** "1234,56" (sem símbolo e sem separador de milhar), para CSV e campos de texto. */
export function formatarDecimal(centavos: Centavos): string {
  const sinal = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(Math.round(centavos));
  return `${sinal}${Math.floor(absoluto / 100)},${String(absoluto % 100).padStart(2, '0')}`;
}

export function reaisParaCentavos(reais: number): Centavos {
  return Math.round(reais * 100);
}

/**
 * Divide um total em N parcelas inteiras: todas iguais, e o resto da divisão vai para a
 * última, para a soma bater exatamente com o total.
 */
export function dividirEmParcelas(total: Centavos, quantidade: number): Centavos[] {
  if (quantidade < 1) return [];
  const base = Math.floor(total / quantidade);
  return Array.from({ length: quantidade }, (_, i) => (i === quantidade - 1 ? total - base * (quantidade - 1) : base));
}

/**
 * Lê um valor escrito em texto ('1.234,56', '1,234.56', '-50,00', 'R$ 10,5', '1500.5') e devolve
 * em centavos, sem passar por ponto flutuante. O último separador (vírgula ou ponto) é o
 * decimal quando tem 1 ou 2 dígitos depois dele; os outros são separadores de milhar.
 * Devolve NaN se não houver número.
 */
export function textoParaCentavos(texto: string): Centavos {
  const limpo = texto.trim().replace(/[^\d,.-]/g, '');
  const negativo = limpo.includes('-');
  const semSinal = limpo.replace(/-/g, '');
  if (!/\d/.test(semSinal)) return Number.NaN;

  const ultimoSeparador = Math.max(semSinal.lastIndexOf(','), semSinal.lastIndexOf('.'));
  const depois = ultimoSeparador >= 0 ? semSinal.slice(ultimoSeparador + 1) : '';
  const temDecimal = ultimoSeparador >= 0 && /^\d{1,2}$/.test(depois);

  const parteInteira = (temDecimal ? semSinal.slice(0, ultimoSeparador) : semSinal).replace(/[,.]/g, '');
  const parteDecimal = temDecimal ? depois.padEnd(2, '0') : '00';
  const centavos = Number(parteInteira || '0') * 100 + Number(parteDecimal);
  return negativo ? -centavos : centavos;
}
