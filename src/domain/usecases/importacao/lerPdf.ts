import { textoParaCentavos } from '@/core/utils/currency';
import { parseDataExtrato } from '@/core/utils/importParsers';
import { bancoPorTexto } from './bancos';
import { contaDoTexto, titularDoTexto } from './dadosDoArquivo';
import { idExternoDeLinhas } from './deduplicar';
import { semAcentos } from './normalizarDescricao';
import type { BancoId, DadosDoCartao, ExtratoLido, OrigemExtrato, TransacaoLida } from './tipos';

/**
 * Extrato de conta ou fatura de cartão em PDF, a partir das linhas que o leitor de PDF tirou
 * das páginas (texto + posição de cada pedaço). Funciona para tabelas de lançamentos em que
 * cada linha começa com a data e termina com o valor ("01/10/2026 ... 100,00 (-)"); a descrição
 * pode ocupar várias linhas acima e abaixo (como no extrato do BB, centralizada na célula).
 */

export type PedacoDePdf = { x: number; texto: string };
export type LinhaDePdf = { y: number; texto: string; pedacos: PedacoDePdf[] };

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_POR_EXTENSO = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

const DATA_NO_COMECO = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b|^(\d{1,2})\s+(?:DE\s+)?(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*\.?\b/;
const VALOR_NO_FIM = /(-\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*(\(\+\)|\(-\)|\+|-|C|D)?$/;
const CABECALHO = /\b(HISTORICO|DESCRICAO|LANCAMENTO|ESTABELECIMENTO)\b.*\bVALOR\b|\bDIA\b.*\bLOTE\b/;
const SALDO = /^(SALDO|S A L D O|TOTAL|SUBTOTAL|SALDO ANTERIOR|SALDO DO DIA|SALDO FINAL)\b/;
const PAGAMENTO_NA_FATURA = /\b(PAGAMENTO|PAGTO|INCLUSAO DE PAGAMENTO|ESTORNO|CREDITO DE|DEVOLUCAO)\b/;

type Ancora = {
  y: number;
  data: { dia: number; mes: number; ano: number | null };
  meio: string;
  valor: number;
  /** Onde começa a descrição na linha (para aceitar só pedaços dessa coluna nas outras linhas). */
  xDescricao: number;
  acima: string[];
  abaixo: string[];
};

function lerDataDoComeco(texto: string): { data: Ancora['data']; resto: string } | null {
  const achado = semAcentos(texto).match(DATA_NO_COMECO);
  if (!achado) return null;
  const resto = texto.slice(achado[0].length).trim();
  if (achado[1]) {
    const dia = Number(achado[1]);
    const mes = Number(achado[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
    const ano = achado[3] ? (achado[3].length === 2 ? 2000 + Number(achado[3]) : Number(achado[3])) : null;
    return { data: { dia, mes, ano }, resto };
  }
  const dia = Number(achado[4]);
  const mes = MESES.indexOf(achado[5]) + 1;
  if (dia < 1 || dia > 31 || mes < 1) return null;
  return { data: { dia, mes, ano: null }, resto };
}

function lerValorDoFim(texto: string, origem: OrigemExtrato): { valor: number; resto: string } | null {
  const achado = texto.match(VALOR_NO_FIM);
  if (!achado || achado.index === undefined) return null;
  // "R$ 1.000,00" no fim de uma frase não é lançamento: precisa estar separado do texto
  const antes = texto.slice(0, achado.index);
  if (antes !== '' && !/\s$/.test(antes)) return null;
  const absoluto = Math.abs(textoParaCentavos(achado[2]));
  if (!Number.isFinite(absoluto)) return null;
  const marca = achado[3] ?? '';
  const negativo = achado[1] !== undefined || marca === '(-)' || marca === '-' || marca === 'D';
  const positivo = marca === '(+)' || marca === '+' || marca === 'C';
  // fatura: compra é positiva; conta: sem marca, é saída
  const valor = origem === 'cartao' ? (negativo ? -absoluto : absoluto) : positivo ? absoluto : -absoluto;
  return { valor, resto: antes.trim() };
}

/** Tira do meio da linha os números de controle (lote, documento) que vêm em colunas próprias. */
function limparMeio(pedacos: PedacoDePdf[]): string {
  return pedacos
    .map((p) => p.texto)
    .filter((t) => !/^\d{4,}$/.test(t))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function anoDeReferencia(texto: string, nomeArquivo: string): number | null {
  const doNome = nomeArquivo.match(/(20\d{2})/);
  const doTexto = texto.match(/\b\d{2}\/\d{2}\/(20\d{2})\b/);
  const ano = doTexto?.[1] ?? doNome?.[1];
  return ano ? Number(ano) : null;
}

function vencimentoDaFatura(texto: string, nomeArquivo: string): string | null {
  const t = semAcentos(texto);
  const completo = t.match(/VENCIMENTO[^0-9]{0,30}(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (completo) {
    const ano = completo[3].length === 2 ? `20${completo[3]}` : completo[3];
    return parseDataExtrato(`${ano}-${completo[2]}-${completo[1]}`);
  }
  const doNome = nomeArquivo.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/) ?? null;
  const doNomeIso = nomeArquivo.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/) ?? null;
  const porExtenso = t.match(/VENCIMENTO[^0-9]{0,30}(\d{1,2}) DE ([A-Z]+)/);
  if (porExtenso) {
    const mes = MESES_POR_EXTENSO.indexOf(porExtenso[2]) + 1;
    const ano = doNome?.[3] ?? doNomeIso?.[1] ?? t.match(/FECHAMENTO[^0-9]{0,60}\d{2}\/\d{2}\/(\d{2,4})/)?.[1];
    if (mes > 0 && ano) {
      const anoCompleto = ano.length === 2 ? `20${ano}` : ano;
      return parseDataExtrato(`${anoCompleto}-${String(mes).padStart(2, '0')}-${porExtenso[1].padStart(2, '0')}`);
    }
  }
  if (doNome) return parseDataExtrato(`${doNome[3]}-${doNome[2]}-${doNome[1]}`);
  if (doNomeIso) return parseDataExtrato(`${doNomeIso[1]}-${doNomeIso[2]}-${doNomeIso[3]}`);
  return null;
}

function dadosDoCartao(texto: string, linhas: LinhaDePdf[], vencimento: string | null): DadosDoCartao {
  const t = semAcentos(texto);
  const limite = t.match(/LIMITE (?:TOTAL|DE CREDITO|DO CARTAO)?\s*:?\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/)?.[1];
  const fechamento = t.match(/FECHAMENTO[^0-9]{0,60}(\d{2})\/\d{2}/)?.[1] ?? t.match(/MELHOR DIA DE COMPRA\s*:?\s*(\d{1,2})/)?.[1];
  const nome = linhas
    .flatMap((l) => l.pedacos)
    .map((p) => p.texto.trim())
    .find((p) => /^Cart[aã]o [A-Z0-9]/.test(p) && !/^Cart[aã]o (de|do|da|final)\b/i.test(p));
  return {
    nome: nome ? nome.replace(/^Cart[aã]o\s+/, '') : null,
    limite: limite ? textoParaCentavos(limite) : null,
    diaFechamento: fechamento ? Number(fechamento) : null,
    diaVencimento: vencimento ? Number(vencimento.slice(8, 10)) : null,
  };
}

/** As linhas do PDF viram o extrato no formato do app (ou null se não há tabela de lançamentos). */
export function lerExtratoDoPdf(paginas: LinhaDePdf[][], nomeArquivo: string): ExtratoLido | null {
  const todas = paginas.flat();
  const textoTodo = todas.map((l) => l.texto).join('\n');
  const semAcento = semAcentos(textoTodo);
  const pareceFatura = /\bFATURA\b/.test(semAcento) && /\b(VENCIMENTO|LIMITE|PAGAMENTO MINIMO)\b/.test(semAcento) && !/EXTRATO DE CONTA/.test(semAcento);
  const origem: OrigemExtrato = pareceFatura ? 'cartao' : 'conta';
  const layoutBB = todas.some((l) => /\bDIA\b.*\bLOTE\b.*\bDOCUMENTO\b.*\bHISTORICO\b/.test(semAcentos(l.texto)));

  const anoPadrao = anoDeReferencia(textoTodo, nomeArquivo);
  const vencimento = origem === 'cartao' ? vencimentoDaFatura(textoTodo, nomeArquivo) : null;
  const lidas: Omit<TransacaoLida, 'idExterno'>[] = [];
  const foraDaTabela: string[] = [];
  let saldoAnterior: number | null = null;
  let ignoradas = 0;
  let numeroDaLinha = 0;

  for (const linhasDaPagina of paginas) {
    // 1. linhas com data no começo e valor no fim são os lançamentos
    const ancoras: Ancora[] = [];
    const soltas: LinhaDePdf[] = [];
    for (const linha of linhasDaPagina) {
      const data = lerDataDoComeco(linha.texto);
      const valor = data ? lerValorDoFim(data.resto, origem) : null;
      if (!data || !valor || CABECALHO.test(semAcentos(linha.texto))) {
        soltas.push(linha);
        continue;
      }
      // pedaços entre a data e o valor (descrição, lote, documento)
      const meio = linha.pedacos.slice(1, -1);
      const xDescricao = meio.find((p) => !/^\d{4,}$/.test(p.texto))?.x ?? linha.pedacos[1]?.x ?? 0;
      const textoDoMeio = linha.pedacos.length >= 3 ? limparMeio(meio) : valor.resto;
      ancoras.push({ y: linha.y, data: data.data, meio: textoDoMeio, valor: valor.valor, xDescricao, acima: [], abaixo: [] });
    }
    if (ancoras.length === 0) {
      foraDaTabela.push(...linhasDaPagina.map((l) => l.texto));
      continue;
    }

    // 2. o resto da descrição: linhas sem data perto de um lançamento, na coluna da descrição
    const espacos = ancoras.slice(1).map((a, i) => ancoras[i].y - a.y).filter((d) => d > 0).sort((a, b) => a - b);
    const espacoTipico = espacos.length > 0 ? espacos[Math.floor(espacos.length / 2)] : 24;
    const alcance = Math.max(8, espacoTipico * 0.75);
    const xColunaDescricao = layoutBB ? Math.min(...ancoras.map((a) => a.xDescricao).filter((x) => x > 0)) : null;
    for (const linha of soltas) {
      const semAcentoDaLinha = semAcentos(linha.texto);
      const primeiroX = linha.pedacos[0]?.x ?? 0;
      const naColuna = xColunaDescricao === null || primeiroX >= xColunaDescricao - 6;
      const proxima = ancoras.reduce<Ancora | null>(
        (melhor, a) => (!melhor || Math.abs(a.y - linha.y) < Math.abs(melhor.y - linha.y) ? a : melhor),
        null
      );
      const pareceDescricao =
        naColuna && !CABECALHO.test(semAcentoDaLinha) && !VALOR_NO_FIM.test(linha.texto.trim()) && proxima !== null && Math.abs(proxima.y - linha.y) <= alcance;
      if (!pareceDescricao || !proxima) {
        foraDaTabela.push(linha.texto);
        continue;
      }
      if (linha.y > proxima.y) proxima.acima.push(linha.texto);
      else proxima.abaixo.push(linha.texto);
    }

    // 3. monta cada lançamento
    for (const a of ancoras) {
      numeroDaLinha++;
      const descricao = [...a.acima, a.meio, ...a.abaixo].filter((t) => t !== '').join(' ').replace(/\s+/g, ' ').trim();
      const semAcentoDescricao = semAcentos(descricao);
      let ano = a.data.ano ?? anoPadrao;
      if (a.data.ano === null && vencimento) {
        // fatura sem ano na data: compra em mês depois do vencimento é do ano anterior
        const anoVenc = Number(vencimento.slice(0, 4));
        const mesVenc = Number(vencimento.slice(5, 7));
        ano = a.data.mes > mesVenc ? anoVenc - 1 : anoVenc;
      }
      const data = ano ? parseDataExtrato(`${ano}-${String(a.data.mes).padStart(2, '0')}-${String(a.data.dia).padStart(2, '0')}`) : null;
      if (SALDO.test(semAcentoDescricao)) {
        if (saldoAnterior === null && lidas.length === 0 && /^SALDO ANTERIOR\b/.test(semAcentoDescricao)) saldoAnterior = a.valor;
        ignoradas++;
        continue;
      }
      if (!data || a.valor === 0) {
        ignoradas++;
        continue;
      }
      const valor = origem === 'cartao' && a.valor > 0 && PAGAMENTO_NA_FATURA.test(semAcentoDescricao) ? -a.valor : a.valor;
      lidas.push({ data, descricao: descricao || 'Importado do extrato', valor, parcela: null, linha: numeroDaLinha });
    }
  }

  if (lidas.length === 0) return null;
  const banco: BancoId | null = layoutBB ? 'bb' : bancoPorTexto(foraDaTabela.join(' ')) ?? bancoPorTexto(nomeArquivo);
  const porHash = idExternoDeLinhas(lidas, `h:${banco ?? 'outro'}`);
  const transacoes = lidas.map((t, i) => ({ ...t, idExterno: porHash[i] }));
  const datas = transacoes.map((t) => t.data).sort();
  return {
    formato: 'pdf',
    banco,
    origem,
    transacoes,
    ignoradas,
    periodo: { inicio: datas[0], fim: datas[datas.length - 1] },
    vencimentoFatura: vencimento,
    titular: titularDoTexto(foraDaTabela),
    conta: origem === 'conta' ? contaDoTexto(foraDaTabela, nomeArquivo) : null,
    saldoAnterior: origem === 'conta' ? saldoAnterior : null,
    cartao: origem === 'cartao' ? dadosDoCartao(textoTodo, todas, vencimento) : null,
  };
}
