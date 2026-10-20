import { addDays, format, parseISO } from 'date-fns';
import { textoParaCentavos } from '@/core/utils/currency';
import { parseDataExtrato } from '@/core/utils/importParsers';
import { idExternoDeLinhas } from './deduplicar';
import { semAcentos } from './normalizarDescricao';
import type { ExtratoLido, OrigemExtrato, TransacaoLida } from './tipos';

/**
 * Texto copiado de prints (o "Texto ao Vivo" do iPhone: Fotos → ícone de texto → Copiar tudo),
 * para a fatura em aberto, que os bancos não deixam exportar. Cada print colado é um bloco: a
 * mesma compra repetida em dois prints (a parte que se sobrepõe) entra uma vez só; dentro de um
 * print, compras iguais continuam separadas. As datas podem vir sozinhas numa linha ("12 OUT",
 * "Hoje", "Sexta, 10 de outubro") e valem para as compras de baixo.
 */

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const VALOR = /(-|−|\+)?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/;
const RUIDO =
  /\b(TOTAL|LIMITE|SALDO|FATURA (ATUAL|ABERTA|FECHADA|ANTERIOR)|VALOR DA FATURA|VENCIMENTO|VENCE EM|MELHOR DIA|PAGAMENTO MINIMO|DISPONIVEL|FECHA EM|FECHAMENTO|JUROS DO ROTATIVO|CET|IOF DE)\b/;
const CREDITO_NO_CARTAO = /\b(PAGAMENTO RECEBIDO|PAGAMENTO EFETUADO|PAGAMENTO DA FATURA|ESTORNO|CREDITO|DEVOLUCAO|REEMBOLSO|CASHBACK)\b/;
const ENTRADA_NA_CONTA = /\b(RECEBIDO|RECEBIDA|ENTRADA|DEPOSITO|SALARIO|RENDIMENTO|ESTORNO|CREDITO)\b/;

type Data = { dia: number; mes: number; ano: number | null };

function anoPelaData(mes: number, hoje: string): number {
  const anoAtual = Number(hoje.slice(0, 4));
  return mes > Number(hoje.slice(5, 7)) ? anoAtual - 1 : anoAtual;
}

function paraIso(d: Data, hoje: string): string | null {
  const ano = d.ano ?? anoPelaData(d.mes, hoje);
  return parseDataExtrato(`${ano}-${String(d.mes).padStart(2, '0')}-${String(d.dia).padStart(2, '0')}`);
}

/** Data no começo da linha (ou a linha inteira): "12/10", "12/10/2026", "12 OUT", "12 de outubro", "Hoje", "Ontem". */
function dataNaLinha(linha: string, hoje: string): { data: string; resto: string } | null {
  const t = semAcentos(linha).replace(/^(SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO)(-FEIRA)?,?\s*/, '').trim();
  if (/^HOJE\b/.test(t)) return { data: hoje, resto: t.slice(4).trim() };
  if (/^ONTEM\b/.test(t)) return { data: format(addDays(parseISO(hoje), -1), 'yyyy-MM-dd'), resto: t.slice(5).trim() };
  const numerica = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numerica) {
    const ano = numerica[3] ? (numerica[3].length === 2 ? 2000 + Number(numerica[3]) : Number(numerica[3])) : null;
    const data = paraIso({ dia: Number(numerica[1]), mes: Number(numerica[2]), ano }, hoje);
    return data ? { data, resto: t.slice(numerica[0].length).trim() } : null;
  }
  const porExtenso = t.match(/^(\d{1,2})\s+(?:DE\s+)?(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*\.?(?:\s+(?:DE\s+)?(\d{4}))?\b/);
  if (porExtenso) {
    const data = paraIso({ dia: Number(porExtenso[1]), mes: MESES.indexOf(porExtenso[2]) + 1, ano: porExtenso[3] ? Number(porExtenso[3]) : null }, hoje);
    return data ? { data, resto: t.slice(porExtenso[0].length).trim() } : null;
  }
  return null;
}

/** Tira horário, "R$" solto e espaços sobrando da descrição. */
function limparDescricao(texto: string): string {
  return texto
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/R\$/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·•\-–]+|[\s·•\-–]+$/g, '')
    .trim();
}

export function lerTextoColado(blocos: string[], origem: OrigemExtrato, hoje: string): ExtratoLido | null {
  const vistasEmOutrosBlocos = new Set<string>();
  const lidas: Omit<TransacaoLida, 'idExterno'>[] = [];
  let numero = 0;

  blocos.forEach((bloco) => {
    const desteBloco = new Set<string>();
    let dataAtual: string | null = null;
    let anteriores: string[] = [];
    for (const bruta of bloco.split(/\r?\n/)) {
      const linha = bruta.trim();
      if (linha === '') continue;
      numero++;
      const comData = dataNaLinha(linha, hoje);
      let texto = linha;
      let dataDaLinha: string | null = null;
      if (comData) {
        dataDaLinha = comData.data;
        if (comData.resto === '' || !VALOR.test(comData.resto)) {
          dataAtual = comData.data;
          if (comData.resto !== '') anteriores = [...anteriores, comData.resto].slice(-2);
          continue;
        }
        texto = comData.resto;
      }
      const valor = texto.match(VALOR);
      const semAcento = semAcentos(texto);
      if (!valor || valor.index === undefined) {
        if (!RUIDO.test(semAcento)) anteriores = [...anteriores, texto].slice(-2);
        continue;
      }
      if (RUIDO.test(semAcento) || /%/.test(texto)) {
        anteriores = [];
        continue;
      }
      const absoluto = Math.abs(textoParaCentavos(valor[2]));
      const naLinha = limparDescricao(texto.slice(0, valor.index) + ' ' + texto.slice(valor.index + valor[0].length));
      // valor sozinho na linha: a descrição é a linha de cima
      const descricao = /[A-Za-zÀ-ÿ]{3,}/.test(naLinha) ? naLinha : limparDescricao(anteriores.join(' '));
      anteriores = [];
      if (!descricao || absoluto === 0 || !Number.isFinite(absoluto)) continue;
      const sinal = valor[1] === '-' || valor[1] === '−' ? -1 : valor[1] === '+' ? 1 : 0;
      const textoTodo = semAcentos(descricao);
      const valorFinal =
        origem === 'cartao'
          ? (sinal < 0 || CREDITO_NO_CARTAO.test(textoTodo) ? -absoluto : absoluto)
          : sinal > 0 || (sinal === 0 && ENTRADA_NA_CONTA.test(textoTodo))
            ? absoluto
            : -absoluto;
      const data = dataDaLinha ?? dataAtual ?? hoje;
      const chave = `${data}|${valorFinal}|${semAcentos(descricao)}`;
      if (vistasEmOutrosBlocos.has(chave)) continue;
      desteBloco.add(chave);
      lidas.push({ data, descricao, valor: valorFinal, parcela: null, linha: numero });
    }
    for (const chave of desteBloco) vistasEmOutrosBlocos.add(chave);
  });

  if (lidas.length === 0) return null;
  const porHash = idExternoDeLinhas(lidas, 'h:colado');
  const transacoes = lidas.map((t, i) => ({ ...t, idExterno: porHash[i] }));
  const datas = transacoes.map((t) => t.data).sort();
  return {
    formato: 'txt',
    banco: null,
    origem,
    transacoes,
    ignoradas: 0,
    periodo: { inicio: datas[0], fim: datas[datas.length - 1] },
    vencimentoFatura: null,
  };
}
