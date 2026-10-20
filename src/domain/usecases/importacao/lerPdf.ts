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
const VALOR_NO_FIM = /([+-]\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*(\(\+\)|\(-\)|\+|-|C|D)?$/;
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
  const sinal = achado[1]?.trim();
  const negativo = sinal === '-' || marca === '(-)' || marca === '-' || marca === 'D';
  const positivo = sinal === '+' || marca === '(+)' || marca === '+' || marca === 'C';
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

// ---------------------------------------------------------------- tabela lida por colunas

type Coluna = 'data' | 'hora' | 'tipo' | 'nome' | 'detalhe' | 'valor' | 'outra';

const ROTULOS: [RegExp, Coluna][] = [
  [/^(DATA|DIA)\b/, 'data'],
  [/^HORA\b/, 'hora'],
  [/^TIPO\b/, 'tipo'],
  [/^(NOME|HISTORICO|DESCRICAO|LANCAMENTO|ESTABELECIMENTO|ESTABELECIMENTOS)\b/, 'nome'],
  [/^DETALHES?\b/, 'detalhe'],
  [/^VALOR\b/, 'valor'],
];
const VALOR_DA_CELULA = /^([+-])?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*(\(\+\)|\(-\)|C|D)?$/;
const DATA_DA_CELULA = /^(\d{1,2})\s+(?:DE\s+)?(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*\.?,?\s*(?:DE\s+)?(\d{4})?$|^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/;

function lerCabecalho(linha: LinhaDePdf): { x: number; coluna: Coluna }[] | null {
  const colunas = linha.pedacos
    .map((p) => ({ x: p.x, coluna: ROTULOS.find(([padrao]) => padrao.test(semAcentos(p.texto)))?.[1] ?? ('outra' as Coluna) }))
    .sort((a, b) => a.x - b.x);
  const tem = (c: Coluna) => colunas.some((x) => x.coluna === c);
  return tem('data') && tem('valor') && tem('nome') && colunas.length >= 4 ? colunas : null;
}

function dataDaCelula(texto: string, anoPadrao: number | null): { dia: number; mes: number; ano: number | null } | null {
  const achado = semAcentos(texto).trim().match(DATA_DA_CELULA);
  if (!achado) return null;
  if (achado[1]) return { dia: Number(achado[1]), mes: MESES.indexOf(achado[2]) + 1, ano: achado[3] ? Number(achado[3]) : anoPadrao };
  const ano = achado[6] ? (achado[6].length === 2 ? 2000 + Number(achado[6]) : Number(achado[6])) : anoPadrao;
  return { dia: Number(achado[4]), mes: Number(achado[5]), ano };
}

/** Descrição como o resto do app entende: "Pix Enviado FULANO", "Compra no cartão LOJA", "Pagamento de boleto SABESP". */
function descricaoDaLinha(tipo: string, nome: string, detalhe: string): string {
  const t = semAcentos(tipo);
  const d = semAcentos(detalhe);
  const semPix = nome.replace(/^Pix\s+/i, '');
  if (/^PIX\b/.test(t) || /^PIX\b/.test(semAcentos(nome))) {
    const sentido = /RECEBID/.test(d) ? 'Recebido' : /ENVIAD/.test(d) ? 'Enviado' : /DEVOLVID|ESTORN/.test(d) ? 'Devolvido' : '';
    return `Pix ${sentido} ${semPix}`.replace(/\s+/g, ' ').trim();
  }
  if (/CARTAO|DEBITO/.test(t)) return `Compra no cartão ${nome}`.trim();
  if (/BOLETO/.test(t)) return `Pagamento de boleto ${nome}`.trim();
  if (/DEPOSITO/.test(t)) return [tipo, /VENDA/.test(semAcentos(nome)) ? '' : nome, detalhe].filter(Boolean).join(' ').trim();
  return [tipo, nome].filter(Boolean).join(' ').trim() || detalhe;
}

/**
 * Lê a tabela pelas colunas do cabeçalho: cada valor na coluna Valor é um lançamento; os outros
 * pedaços (hora, tipo, nome em duas linhas, detalhe, data) vão para o lançamento mais perto na
 * altura; a data vale para as linhas de baixo até aparecer outra.
 */
function lerPorColunas(
  paginas: LinhaDePdf[][],
  origem: OrigemExtrato,
  anoPadrao: number | null
): { lidas: Omit<TransacaoLida, 'idExterno'>[]; ignoradas: number; saldoAnterior: number | null; foraDaTabela: string[] } | null {
  type Linha = { y: number; valor: number; celulas: Record<Coluna, { y: number; texto: string }[]> };
  const lidas: Omit<TransacaoLida, 'idExterno'>[] = [];
  const foraDaTabela: string[] = [];
  let ignoradas = 0;
  let dataAtual: { dia: number; mes: number; ano: number | null } | null = null;
  let achouCabecalho = false;
  let numero = 0;

  for (const linhas of paginas) {
    const indicesDeCabecalho = linhas.map((l, i) => (lerCabecalho(l) ? i : -1)).filter((i) => i >= 0);
    if (indicesDeCabecalho.length === 0) {
      foraDaTabela.push(...linhas.map((l) => l.texto));
      continue;
    }
    achouCabecalho = true;
    foraDaTabela.push(...linhas.slice(0, indicesDeCabecalho[0]).map((l) => l.texto));
    indicesDeCabecalho.forEach((inicio, k) => {
      const cabecalho = lerCabecalho(linhas[inicio]) ?? [];
      const fim = k + 1 < indicesDeCabecalho.length ? indicesDeCabecalho[k + 1] : linhas.length;
      const colunaDe = (x: number): Coluna => {
        let escolhida: Coluna = cabecalho[0]?.coluna ?? 'outra';
        for (const c of cabecalho) if (c.x <= x + 4) escolhida = c.coluna;
        return escolhida;
      };
      const doBloco = linhas.slice(inicio + 1, fim);
      const vazias = (): Linha['celulas'] => ({ data: [], hora: [], tipo: [], nome: [], detalhe: [], valor: [], outra: [] });
      // 1. as linhas com valor na última coluna são os lançamentos ("Saldo do dia" não)
      const lancamentos: Linha[] = [];
      const soltas: LinhaDePdf[] = [];
      for (const linha of doBloco) {
        const ultimo = linha.pedacos[linha.pedacos.length - 1];
        const valor = ultimo ? semAcentos(ultimo.texto).match(VALOR_DA_CELULA) : null;
        const ehValor = valor && ['valor', 'detalhe'].includes(colunaDe(ultimo.x));
        if (SALDO.test(semAcentos(linha.texto).replace(/^\S+\s+\S+\s+/, '')) || /\bSALDO DO DIA\b|\bSALDO\b/.test(semAcentos(linha.texto))) {
          if (ehValor) ignoradas++;
          continue;
        }
        if (!ehValor || !valor) {
          soltas.push(linha);
          continue;
        }
        const absoluto = Math.abs(textoParaCentavos(valor[2]));
        const negativo = valor[1] === '-' || valor[3] === '(-)' || valor[3] === 'D';
        const positivo = valor[1] === '+' || valor[3] === '(+)' || valor[3] === 'C';
        const sinal = negativo ? -1 : positivo ? 1 : origem === 'cartao' ? 1 : -1;
        const celulas = vazias();
        for (const p of linha.pedacos.slice(0, -1)) celulas[colunaDe(p.x)].push({ y: linha.y, texto: p.texto });
        lancamentos.push({ y: linha.y, valor: sinal * absoluto, celulas });
      }
      // 2. pedaços soltos (nome em duas linhas, data na linha de cima) vão para o mais perto
      const espacos = lancamentos.slice(1).map((l, i) => lancamentos[i].y - l.y).filter((d) => d > 0).sort((a, b) => a - b);
      const alcance = Math.max(6, (espacos.length > 0 ? espacos[Math.floor(espacos.length / 2)] : 15) * 0.6);
      for (const linha of soltas) {
        const perto = lancamentos.reduce<Linha | null>((m, l) => (!m || Math.abs(l.y - linha.y) < Math.abs(m.y - linha.y) ? l : m), null);
        if (!perto || Math.abs(perto.y - linha.y) > alcance) {
          foraDaTabela.push(linha.texto);
          continue;
        }
        for (const p of linha.pedacos) perto.celulas[colunaDe(p.x)].push({ y: linha.y, texto: p.texto });
      }
      // 3. cada lançamento, de cima para baixo
      for (const l of [...lancamentos].sort((a, b) => b.y - a.y)) {
        numero++;
        const texto = (c: Coluna) =>
          [...l.celulas[c]]
            .sort((a, b) => b.y - a.y)
            .map((p) => p.texto)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        const dataNaLinha = dataDaCelula(texto('data'), anoPadrao);
        if (dataNaLinha) dataAtual = dataNaLinha;
        const d = dataAtual;
        const data = d && d.ano && d.mes > 0 ? parseDataExtrato(`${d.ano}-${String(d.mes).padStart(2, '0')}-${String(d.dia).padStart(2, '0')}`) : null;
        const descricao = descricaoDaLinha(texto('tipo'), texto('nome'), texto('detalhe'));
        if (!data || l.valor === 0 || SALDO.test(semAcentos(descricao))) {
          ignoradas++;
          continue;
        }
        lidas.push({ data, descricao: descricao || 'Importado do extrato', valor: l.valor, parcela: null, linha: numero });
      }
    });
  }
  if (!achouCabecalho || lidas.length === 0) return null;
  const inicial = semAcentos(foraDaTabela.join('\n')).match(/SALDO INICIAL\s*([+-])?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  const saldoAnterior = inicial ? (inicial[1] === '-' ? -1 : 1) * Math.abs(textoParaCentavos(inicial[2])) : null;
  return { lidas, ignoradas, saldoAnterior, foraDaTabela };
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

  // tabela com cabeçalho (Data | Hora | Tipo | Nome | Detalhe | Valor), em que a data só aparece
  // na primeira linha do dia (InfinitePay): lida por colunas quando acha mais lançamentos
  const porColunas = layoutBB ? null : lerPorColunas(paginas, origem, anoPadrao);
  if (porColunas && porColunas.lidas.length > lidas.length) {
    lidas.splice(0, lidas.length, ...porColunas.lidas);
    ignoradas = porColunas.ignoradas;
    saldoAnterior = porColunas.saldoAnterior;
    foraDaTabela.splice(0, foraDaTabela.length, ...porColunas.foraDaTabela);
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
