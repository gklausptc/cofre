import { formatarDecimal, textoParaCentavos } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { parseDataExtrato } from '@/core/utils/importParsers';
import { dataFechamentoDaFatura, dataNoMes, mesDeCobrancaDaParcela, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import { dataNaFatura } from './analisarImportacao';
import { semAcentos } from './normalizarDescricao';
import type { PagamentoFatura } from '@/domain/repositories/faturasRepository';
import type { DadosGastoRapido } from '@/domain/repositories/gastosRapidosRepository';
import type { RegistroDeImportacao } from '@/domain/repositories/importacoesRepository';
import type { DadosMovimentacao } from '@/domain/repositories/movimentacoesRepository';
import type {
  Cartao,
  Categoria,
  CompraParcelada,
  ContaBancaria,
  ContaFixa,
  Fatura,
  GastoRapido,
  MembroFamilia,
  Movimentacao,
  Parcela,
} from '@/domain/types/entities';

/**
 * Planilha do Cofre Klaus: um CSV com tudo o que foi lançado, em todas as contas e cartões,
 * já decidido (tipo, categoria, de que fatura). O app exporta neste formato e importa de volta
 * sem perguntas: serve para começar do zero a partir de uma planilha conferida, ou para levar
 * os dados para outro aparelho em forma que dá para abrir e corrigir no Excel.
 *
 * Uma linha por lançamento, com estas colunas (separadas por ";", valor com vírgula):
 * - Data: dd/mm/aaaa (vazia nas linhas Conta e Cartão);
 * - Conta ou cartão: o nome (cria se não existir);
 * - Tipo: Conta, Cartão, Entrada, Saída, Transferência, Entrada de conta sua, Saída para conta
 *   sua, Compra no cartão, Crédito no cartão, Pagamento de fatura, Fatura paga;
 * - Descrição, Categoria (cria se não existir), Valor (sempre positivo; na linha Conta é o
 *   saldo inicial e pode ser negativo; na linha Cartão é o limite);
 * - Destino: a conta que recebe a transferência, ou o cartão da fatura paga;
 * - Fatura: mês de vencimento (aaaa-mm) da compra no cartão ou da fatura paga;
 * - Parcela: "3/10" (opcional); Membro (opcional); Observação (o app ignora).
 * Na linha Cartão, a Descrição diz os dias: "fecha dia 1, vence dia 10".
 */

export const COLUNAS_DA_PLANILHA = [
  'Data',
  'Conta ou cartão',
  'Tipo',
  'Descrição',
  'Categoria',
  'Valor',
  'Destino',
  'Fatura',
  'Parcela',
  'Membro',
  'Observação',
] as const;

export type TipoDaLinha =
  | 'conta'
  | 'cartao'
  | 'entrada'
  | 'saida'
  | 'transferencia'
  | 'entrada_interna'
  | 'saida_interna'
  | 'compra_cartao'
  | 'credito_cartao'
  | 'pagamento_fatura'
  | 'fatura_paga';

export const ROTULO_DO_TIPO_NA_PLANILHA: Record<TipoDaLinha, string> = {
  conta: 'Conta',
  cartao: 'Cartão',
  entrada: 'Entrada',
  saida: 'Saída',
  transferencia: 'Transferência',
  entrada_interna: 'Entrada de conta sua',
  saida_interna: 'Saída para conta sua',
  compra_cartao: 'Compra no cartão',
  credito_cartao: 'Crédito no cartão',
  pagamento_fatura: 'Pagamento de fatura',
  fatura_paga: 'Fatura paga',
};

export type LinhaDaPlanilha = {
  /** Linha no arquivo (a 1 é o cabeçalho). */
  numero: number;
  data: string | null;
  onde: string;
  tipo: TipoDaLinha;
  descricao: string;
  categoria: string | null;
  /** Centavos. Positivo, menos o saldo inicial na linha Conta. */
  valor: number;
  destino: string | null;
  fatura: string | null;
  parcela: { numero: number; total: number } | null;
  membro: string | null;
  observacao: string | null;
};

export type ErroDaPlanilha = { numero: number; motivo: string };

const chave = (texto: string) => semAcentos(texto).toLowerCase().replace(/\s+/g, ' ').trim();

const TIPO_POR_ROTULO = new Map<string, TipoDaLinha>([
  ...(Object.entries(ROTULO_DO_TIPO_NA_PLANILHA) as [TipoDaLinha, string][]).map(([tipo, rotulo]) => [chave(rotulo), tipo] as const),
  ['receita', 'entrada'],
  ['despesa', 'saida'],
  ['gasto', 'saida'],
  ['compra', 'compra_cartao'],
  ['estorno no cartao', 'credito_cartao'],
  ['saida para conta propria', 'saida_interna'],
  ['entrada de conta propria', 'entrada_interna'],
]);

/** Divide uma linha de CSV com ";" (aspas com "" dentro, como o Excel grava). */
function dividirCampos(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') {
      campos.push(atual.trim());
      atual = '';
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

function linhasDoTexto(texto: string): string[] {
  return texto.replace(/^﻿/, '').split(/\r\n|\n|\r/);
}

/** É a planilha do Cofre (pelo cabeçalho)? */
export function ehPlanilhaDoCofre(texto: string): boolean {
  const primeira = linhasDoTexto(texto).find((l) => l.trim() !== '');
  if (!primeira) return false;
  const colunas = dividirCampos(primeira).map(chave);
  return colunas.includes('data') && colunas.includes('conta ou cartao') && colunas.includes('tipo') && colunas.includes('valor');
}

const MESES_ABREVIADOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Mês da fatura: "2026-10", "10/2026" e o que o Excel grava quando entende o valor como data
 * ao salvar ("out/26", "out-2026", "01/10/2026", "2026-10-01").
 */
export function lerMes(texto: string): string | null {
  const t = semAcentos(texto).toLowerCase().trim();
  const mes = (m: number, ano: number) => (m >= 1 && m <= 12 ? `${ano < 100 ? 2000 + ano : ano}-${String(m).padStart(2, '0')}` : null);
  const iso = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (iso) return mes(Number(iso[2]), Number(iso[1]));
  const data = t.match(/^\d{1,2}\/(\d{1,2})\/(\d{2,4})$/);
  if (data) return mes(Number(data[1]), Number(data[2]));
  const br = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (br) return mes(Number(br[1]), Number(br[2]));
  const porNome = t.match(/^([a-z]{3})[a-z]*\.?(?:\s*de\s*|[\/\-\s])(\d{2,4})$/);
  if (porNome && MESES_ABREVIADOS.includes(porNome[1])) return mes(MESES_ABREVIADOS.indexOf(porNome[1]) + 1, Number(porNome[2]));
  return null;
}

/** Parcela: "3/10", "3 de 10" e o "03/abr" que o Excel grava quando entende "3/4" como data. */
export function lerParcela(texto: string): { numero: number; total: number } | null {
  const t = semAcentos(texto).toLowerCase().trim();
  const simples = t.match(/^(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})$/);
  if (simples) return { numero: Number(simples[1]), total: Number(simples[2]) };
  const comoData = t.match(/^(\d{1,2})[\/\-]([a-z]{3})[a-z]*\.?$/);
  if (comoData && MESES_ABREVIADOS.includes(comoData[2])) return { numero: Number(comoData[1]), total: MESES_ABREVIADOS.indexOf(comoData[2]) + 1 };
  return null;
}

/** Lê a planilha: as linhas válidas e, para as outras, o motivo (com o número da linha). */
export function lerPlanilhaDoCofre(texto: string): { linhas: LinhaDaPlanilha[]; erros: ErroDaPlanilha[] } {
  const brutas = linhasDoTexto(texto);
  const cabecalho = dividirCampos(brutas[0] ?? '').map(chave);
  const indice = (nome: string) => cabecalho.indexOf(chave(nome));
  const posicao = Object.fromEntries(COLUNAS_DA_PLANILHA.map((c) => [c, indice(c)])) as Record<(typeof COLUNAS_DA_PLANILHA)[number], number>;
  const linhas: LinhaDaPlanilha[] = [];
  const erros: ErroDaPlanilha[] = [];

  brutas.slice(1).forEach((bruta, i) => {
    const numero = i + 2;
    if (bruta.trim() === '' || /^;*$/.test(bruta.trim())) return;
    const campos = dividirCampos(bruta);
    const campo = (nome: (typeof COLUNAS_DA_PLANILHA)[number]) => (posicao[nome] >= 0 ? (campos[posicao[nome]] ?? '').trim() : '');
    const tipo = TIPO_POR_ROTULO.get(chave(campo('Tipo')));
    if (!tipo) {
      erros.push({ numero, motivo: `Tipo "${campo('Tipo')}" não reconhecido` });
      return;
    }
    const onde = campo('Conta ou cartão');
    if (onde === '') {
      erros.push({ numero, motivo: 'Falta a conta ou o cartão' });
      return;
    }
    const valor = textoParaCentavos(campo('Valor') || '0');
    if (!Number.isFinite(valor)) {
      erros.push({ numero, motivo: `Valor "${campo('Valor')}" não é um número` });
      return;
    }
    const declaracao = tipo === 'conta' || tipo === 'cartao';
    const data = campo('Data') ? parseDataExtrato(campo('Data')) : null;
    if (!declaracao && !data) {
      erros.push({ numero, motivo: campo('Data') ? `Data "${campo('Data')}" inválida` : 'Falta a data' });
      return;
    }
    const destino = campo('Destino') || null;
    if ((tipo === 'transferencia' || tipo === 'pagamento_fatura') && !destino) {
      erros.push({ numero, motivo: tipo === 'transferencia' ? 'Transferência sem a conta de destino' : 'Pagamento de fatura sem o cartão (coluna Destino)' });
      return;
    }
    const faturaTexto = campo('Fatura');
    const fatura = faturaTexto ? lerMes(faturaTexto) : null;
    if (faturaTexto && !fatura) {
      erros.push({ numero, motivo: `Fatura "${faturaTexto}" deve ser aaaa-mm` });
      return;
    }
    if ((tipo === 'pagamento_fatura' || tipo === 'fatura_paga') && !fatura) {
      erros.push({ numero, motivo: 'Diga de que fatura é (coluna Fatura, aaaa-mm)' });
      return;
    }
    const parcela = campo('Parcela') ? lerParcela(campo('Parcela')) : null;
    linhas.push({
      numero,
      data,
      onde,
      tipo,
      descricao: campo('Descrição'),
      categoria: campo('Categoria') || null,
      valor: declaracao && tipo === 'conta' ? valor : Math.abs(valor),
      destino,
      fatura,
      parcela,
      membro: campo('Membro') || null,
      observacao: campo('Observação') || null,
    });
  });
  return { linhas, erros };
}

// ---------------------------------------------------------------- o que a importação vai criar

const ONDE_EH_CARTAO = new Set<TipoDaLinha>(['cartao', 'compra_cartao', 'credito_cartao', 'fatura_paga']);

function diasDoCartao(descricao: string): { diaFechamento: number; diaVencimento: number } | null {
  const t = semAcentos(descricao).toUpperCase();
  const fecha = t.match(/FECHA\D{0,12}(\d{1,2})/)?.[1];
  const vence = t.match(/VENCE\D{0,12}(\d{1,2})/)?.[1];
  if (!fecha || !vence) return null;
  const f = Number(fecha);
  const v = Number(vence);
  return f >= 1 && f <= 31 && v >= 1 && v <= 31 ? { diaFechamento: f, diaVencimento: v } : null;
}

export type NaturezaDaCategoria = 'receita' | 'despesa';

export function naturezaDaLinha(tipo: TipoDaLinha): NaturezaDaCategoria | null {
  if (tipo === 'entrada') return 'receita';
  if (tipo === 'saida' || tipo === 'compra_cartao' || tipo === 'credito_cartao') return 'despesa';
  return null;
}

export type ExistentesParaPlanilha = {
  contas: Pick<ContaBancaria, 'id' | 'nomeConta'>[];
  cartoes: Pick<Cartao, 'id' | 'nome'>[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[];
  membros: Pick<MembroFamilia, 'id' | 'nome'>[];
};

export type PlanoDaPlanilha = {
  contasNovas: { nome: string; banco: string; saldoInicial: number }[];
  /** Saldo inicial dito na planilha para uma conta que já existe (o app atualiza). */
  saldosIniciais: { contaId: number; nome: string; saldoInicial: number }[];
  cartoesNovos: { nome: string; limite: number; diaFechamento: number; diaVencimento: number }[];
  categoriasNovas: { nome: string; tipo: NaturezaDaCategoria }[];
  avisos: string[];
  totais: { entradas: number; saidas: number; transferencias: number; comprasNoCartao: number; pagamentosDeFatura: number };
  lancamentos: number;
  periodo: { inicio: string; fim: string } | null;
};

/** Contas, cartões e categorias que faltam, e os totais, para a prévia antes de importar. */
export function planejarPlanilha(linhas: LinhaDaPlanilha[], existentes: ExistentesParaPlanilha): PlanoDaPlanilha {
  const contasExistentes = new Map(existentes.contas.map((c) => [chave(c.nomeConta), c]));
  const cartoesExistentes = new Set(existentes.cartoes.map((c) => chave(c.nome)));
  const categoriasExistentes = new Set(existentes.categorias.map((c) => `${c.tipo}|${chave(c.nome)}`));
  const membrosExistentes = new Set(existentes.membros.map((m) => chave(m.nome)));

  const contasNovas = new Map<string, PlanoDaPlanilha['contasNovas'][number]>();
  const saldosIniciais: PlanoDaPlanilha['saldosIniciais'] = [];
  const cartoesNovos = new Map<string, PlanoDaPlanilha['cartoesNovos'][number]>();
  const categoriasNovas = new Map<string, PlanoDaPlanilha['categoriasNovas'][number]>();
  const avisos: string[] = [];
  const membrosDesconhecidos = new Set<string>();

  const precisaConta = (nome: string) => {
    if (contasExistentes.has(chave(nome)) || contasNovas.has(chave(nome))) return;
    contasNovas.set(chave(nome), { nome, banco: '', saldoInicial: 0 });
  };
  const precisaCartao = (nome: string) => {
    if (cartoesExistentes.has(chave(nome)) || cartoesNovos.has(chave(nome))) return;
    cartoesNovos.set(chave(nome), { nome, limite: 0, diaFechamento: 1, diaVencimento: 10 });
    avisos.push(`O cartão "${nome}" não tem linha Cartão: vai ser criado fechando dia 1 e vencendo dia 10 (dá para mudar depois).`);
  };

  // primeiro as declarações (Conta e Cartão), para os dias e saldos valerem
  for (const l of linhas) {
    if (l.tipo === 'conta') {
      const existente = contasExistentes.get(chave(l.onde));
      if (existente) saldosIniciais.push({ contaId: existente.id, nome: existente.nomeConta, saldoInicial: l.valor });
      else contasNovas.set(chave(l.onde), { nome: l.onde, banco: l.descricao, saldoInicial: l.valor });
    } else if (l.tipo === 'cartao' && !cartoesExistentes.has(chave(l.onde))) {
      const dias = diasDoCartao(l.descricao);
      if (!dias) avisos.push(`Linha ${l.numero}: o cartão "${l.onde}" não diz os dias ("fecha dia 1, vence dia 10"); vai fechar dia 1 e vencer dia 10.`);
      cartoesNovos.set(chave(l.onde), { nome: l.onde, limite: l.valor, ...(dias ?? { diaFechamento: 1, diaVencimento: 10 }) });
    }
  }

  const totais = { entradas: 0, saidas: 0, transferencias: 0, comprasNoCartao: 0, pagamentosDeFatura: 0 };
  const datas: string[] = [];
  for (const l of linhas) {
    if (l.tipo === 'conta' || l.tipo === 'cartao') continue;
    if (l.data) datas.push(l.data);
    if (ONDE_EH_CARTAO.has(l.tipo)) precisaCartao(l.onde);
    else precisaConta(l.onde);
    if (l.tipo === 'transferencia' && l.destino) precisaConta(l.destino);
    if (l.tipo === 'pagamento_fatura' && l.destino) precisaCartao(l.destino);
    const natureza = naturezaDaLinha(l.tipo);
    if (natureza && l.categoria && !categoriasExistentes.has(`${natureza}|${chave(l.categoria)}`)) {
      categoriasNovas.set(`${natureza}|${chave(l.categoria)}`, { nome: l.categoria, tipo: natureza });
    }
    if (l.membro && !membrosExistentes.has(chave(l.membro))) membrosDesconhecidos.add(l.membro);
    if (l.tipo === 'entrada') totais.entradas += l.valor;
    if (l.tipo === 'saida') totais.saidas += l.valor;
    if (l.tipo === 'transferencia') totais.transferencias += l.valor;
    if (l.tipo === 'compra_cartao') totais.comprasNoCartao += l.valor;
    if (l.tipo === 'credito_cartao') totais.comprasNoCartao -= l.valor;
    if (l.tipo === 'pagamento_fatura' || l.tipo === 'fatura_paga') totais.pagamentosDeFatura += l.valor;
  }
  for (const nome of membrosDesconhecidos) avisos.push(`Membro "${nome}" não está cadastrado: os lançamentos dele entram sem membro.`);
  datas.sort();
  return {
    contasNovas: [...contasNovas.values()],
    saldosIniciais,
    cartoesNovos: [...cartoesNovos.values()],
    categoriasNovas: [...categoriasNovas.values()],
    avisos,
    totais,
    lancamentos: linhas.filter((l) => l.tipo !== 'conta' && l.tipo !== 'cartao').length,
    periodo: datas.length > 0 ? { inicio: datas[0], fim: datas[datas.length - 1] } : null,
  };
}

// ---------------------------------------------------------------- o que gravar

/** FNV-1a de 32 bits em hexadecimal: id estável da linha, para não importar a mesma duas vezes. */
function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export type IdsParaPlanilha = {
  contas: Pick<ContaBancaria, 'id' | 'nomeConta'>[];
  cartoes: Pick<Cartao, 'id' | 'nome' | 'diaFechamento' | 'diaVencimento'>[];
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[];
  membros: Pick<MembroFamilia, 'id' | 'nome'>[];
  /** Ids externos de lançamentos que já estão no app (reimportar a mesma planilha não duplica). */
  idsExternos: Set<string>;
};

export type RegistroDaPlanilha = RegistroDeImportacao & { jaImportadas: number };

/** Depois de criar contas, cartões e categorias: o registro da importação (uma só, de tudo). */
export function montarRegistroDaPlanilha(
  linhas: LinhaDaPlanilha[],
  ids: IdsParaPlanilha,
  opcoes: { arquivo: string; criadaEm: string }
): RegistroDaPlanilha {
  const contaPorNome = new Map(ids.contas.map((c) => [chave(c.nomeConta), c.id]));
  const cartaoPorNome = new Map(ids.cartoes.map((c) => [chave(c.nome), c]));
  const categoriaPorNome = new Map(ids.categorias.map((c) => [`${c.tipo}|${chave(c.nome)}`, c.id]));
  const membroPorNome = new Map(ids.membros.map((m) => [chave(m.nome), m.id]));

  const movimentacoes: DadosMovimentacao[] = [];
  const gastos: DadosGastoRapido[] = [];
  const repeticoes = new Map<string, number>();
  let jaImportadas = 0;

  type Pagamento = { linha: LinhaDaPlanilha; contaId: number | null; idExterno: string };
  const pagamentosPorFatura = new Map<string, { cartao: IdsParaPlanilha['cartoes'][number]; mes: string; itens: Pagamento[] }>();

  const lancamentos = linhas.filter((l) => l.tipo !== 'conta' && l.tipo !== 'cartao');
  for (const l of lancamentos) {
    const base = [l.data, chave(l.onde), l.tipo, chave(l.descricao), l.valor, chave(l.destino ?? ''), l.fatura ?? '', l.parcela ? `${l.parcela.numero}/${l.parcela.total}` : ''].join('|');
    const vez = (repeticoes.get(base) ?? 0) + 1;
    repeticoes.set(base, vez);
    const idExterno = `cofre:${hash(base)}:${vez}`;
    if (ids.idsExternos.has(idExterno)) {
      jaImportadas++;
      continue;
    }
    const data = l.data as string;
    const natureza = naturezaDaLinha(l.tipo);
    const categoriaId = natureza && l.categoria ? (categoriaPorNome.get(`${natureza}|${chave(l.categoria)}`) ?? null) : null;
    const membroId = l.membro ? (membroPorNome.get(chave(l.membro)) ?? null) : null;
    const descricao = l.descricao || ROTULO_DO_TIPO_NA_PLANILHA[l.tipo];

    if (ONDE_EH_CARTAO.has(l.tipo)) {
      const cartao = cartaoPorNome.get(chave(l.onde));
      if (!cartao) continue;
      if (l.tipo === 'fatura_paga') {
        const chaveFatura = `${cartao.id}|${l.fatura}`;
        const grupo = pagamentosPorFatura.get(chaveFatura) ?? { cartao, mes: l.fatura as string, itens: [] };
        grupo.itens.push({ linha: l, contaId: null, idExterno });
        pagamentosPorFatura.set(chaveFatura, grupo);
        continue;
      }
      const marca = l.parcela ? `${l.parcela.numero}/${l.parcela.total}` : null;
      const comParcela = marca && !descricao.replace(/\s/g, '').includes(marca) ? `${descricao} (${marca})` : descricao;
      gastos.push({
        valor: l.tipo === 'credito_cartao' ? -l.valor : l.valor,
        data: l.fatura ? dataNaFatura(data, l.fatura, cartao).data : data,
        formaPagamento: 'cartao',
        cartaoId: cartao.id,
        categoriaId,
        descricao: comParcela,
        membroId,
        idExterno,
      });
      continue;
    }

    const contaId = contaPorNome.get(chave(l.onde));
    if (contaId === undefined) continue;
    if (l.tipo === 'pagamento_fatura') {
      const cartao = cartaoPorNome.get(chave(l.destino ?? ''));
      if (!cartao) continue;
      const chaveFatura = `${cartao.id}|${l.fatura}`;
      const grupo = pagamentosPorFatura.get(chaveFatura) ?? { cartao, mes: l.fatura as string, itens: [] };
      grupo.itens.push({ linha: l, contaId, idExterno });
      pagamentosPorFatura.set(chaveFatura, grupo);
      continue;
    }
    const comum = { contaBancariaId: contaId, valor: l.valor, data, descricao, membroId, idExterno };
    if (l.tipo === 'transferencia') {
      const destinoId = contaPorNome.get(chave(l.destino ?? ''));
      if (destinoId === undefined) continue;
      movimentacoes.push({ ...comum, tipo: 'transferencia', contaDestinoId: destinoId, origem: 'manual', categoriaId: null });
    } else if (l.tipo === 'entrada' || l.tipo === 'entrada_interna') {
      movimentacoes.push({ ...comum, tipo: 'entrada', origem: l.tipo === 'entrada_interna' ? 'interna' : 'manual', categoriaId });
    } else {
      movimentacoes.push({ ...comum, tipo: 'saida', origem: l.tipo === 'saida_interna' ? 'interna' : 'manual', categoriaId });
    }
  }

  // faturas pagas: o valor pago é a soma dos pagamentos dela; cada pagamento de uma conta é uma saída ligada
  const pagamentosDeFatura: RegistroDeImportacao['pagamentosDeFatura'] = [];
  const faturasPagas: PagamentoFatura[] = [];
  for (const { cartao, mes, itens } of pagamentosPorFatura.values()) {
    const ordenados = [...itens].sort((a, b) => (a.linha.data ?? '').localeCompare(b.linha.data ?? ''));
    const maior = [...itens].filter((i) => i.contaId !== null).sort((a, b) => b.linha.valor - a.linha.valor)[0];
    const pagamento: PagamentoFatura = {
      cartaoId: cartao.id,
      mesReferencia: mes,
      dataFechamento: dataFechamentoDaFatura(mes, cartao),
      dataVencimento: dataNoMes(mes, cartao.diaVencimento),
      contaBancariaId: maior?.contaId ?? null,
      valorPago: itens.reduce((s, i) => s + i.linha.valor, 0),
      dataPagamento: ordenados[ordenados.length - 1].linha.data as string,
    };
    const comConta = itens.filter((i) => i.contaId !== null);
    if (comConta.length === 0) faturasPagas.push(pagamento);
    for (const item of comConta) {
      pagamentosDeFatura.push({
        pagamento,
        parcelaIds: [],
        saida: {
          contaBancariaId: item.contaId as number,
          tipo: 'saida',
          valor: item.linha.valor,
          data: item.linha.data as string,
          descricao: item.linha.descricao || `Pagamento da fatura ${cartao.nome}`,
          origem: 'fatura',
          categoriaId: null,
          membroId: item.linha.membro ? (membroPorNome.get(chave(item.linha.membro)) ?? null) : null,
          idExterno: item.idExterno,
        },
      });
    }
  }

  const datas = lancamentos.map((l) => l.data as string).sort();
  const importadas = movimentacoes.length + gastos.length + pagamentosDeFatura.length + faturasPagas.length;
  return {
    importacao: {
      arquivo: opcoes.arquivo,
      formato: 'csv',
      banco: null,
      contaBancariaId: null,
      cartaoId: null,
      periodoInicio: datas[0] ?? null,
      periodoFim: datas[datas.length - 1] ?? null,
      totalLinhas: lancamentos.length,
      importadas,
      ignoradas: jaImportadas,
      pendentes: 0,
      criadaEm: opcoes.criadaEm,
    },
    movimentacoes,
    gastos,
    pagamentosDeContaFixa: [],
    pagamentosDeFatura,
    faturasPagas,
    alteracoes: [],
    regrasNovas: [],
    regrasUsadas: [],
    perguntas: [],
    jaImportadas,
  };
}

// ---------------------------------------------------------------- exportar neste formato

function campoCsv(valor: string): string {
  return /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** Monta o CSV (com BOM, para o Excel em português abrir com acento). */
export function montarCsvDaPlanilha(linhas: string[][]): string {
  const corpo = [[...COLUNAS_DA_PLANILHA], ...linhas].map((l) => l.map(campoCsv).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}

export type DadosParaPlanilha = {
  contas: ContaBancaria[];
  cartoes: Cartao[];
  categorias: Pick<Categoria, 'id' | 'nome'>[];
  membros: Pick<MembroFamilia, 'id' | 'nome'>[];
  movimentacoes: Movimentacao[];
  gastos: GastoRapido[];
  parcelas: Parcela[];
  comprasParceladas: CompraParcelada[];
  contasFixas: ContaFixa[];
  faturas: Fatura[];
};

/**
 * Tudo o que está no app neste formato: as contas (com o saldo inicial), os cartões, cada
 * movimentação, gasto, parcela de compra e fatura paga. Importar este arquivo num app vazio
 * refaz os mesmos saldos e relatórios (as compras parceladas voltam como uma compra por fatura;
 * contas fixas, cofrinhos e reserva não entram).
 */
export function montarPlanilhaDoCofre(d: DadosParaPlanilha): string {
  const nomeDaConta = new Map(d.contas.map((c) => [c.id, c.nomeConta]));
  const cartaoPorId = new Map(d.cartoes.map((c) => [c.id, c]));
  const nomeDaCategoria = new Map(d.categorias.map((c) => [c.id, c.nome]));
  const nomeDoMembro = new Map(d.membros.map((m) => [m.id, m.nome]));
  const faturaPorId = new Map(d.faturas.map((f) => [f.id, f]));
  const contaFixaPorId = new Map(d.contasFixas.map((c) => [c.id, c]));
  const parcelaPorId = new Map(d.parcelas.map((p) => [p.id, p]));
  const compraPorId = new Map(d.comprasParceladas.map((c) => [c.id, c]));
  const valor = (centavos: number) => formatarDecimal(centavos);
  const categoria = (id: number | null) => (id !== null ? (nomeDaCategoria.get(id) ?? '') : '');
  const membro = (id: number | null) => (id !== null ? (nomeDoMembro.get(id) ?? '') : '');

  const declaracoes: string[][] = [
    ...d.contas.map((c) => ['', c.nomeConta, 'Conta', c.banco, '', valor(c.saldoInicial), '', '', '', '', '']),
    ...d.cartoes.map((c) => ['', c.nome, 'Cartão', `fecha dia ${c.diaFechamento}, vence dia ${c.diaVencimento}`, '', valor(c.limite), '', '', '', '', '']),
  ];
  const lancamentos: { data: string; linha: string[] }[] = [];
  const add = (data: string, linha: string[]) => lancamentos.push({ data, linha: [formatarData(data), ...linha] });

  const faturasComSaida = new Set<number>();
  for (const m of d.movimentacoes) {
    const conta = nomeDaConta.get(m.contaBancariaId) ?? `Conta ${m.contaBancariaId}`;
    const descricao = m.descricao ?? '';
    if (m.tipo === 'transferencia') {
      add(m.data, [conta, 'Transferência', descricao, '', valor(m.valor), nomeDaConta.get(m.contaDestinoId ?? -1) ?? '', '', '', membro(m.membroId), '']);
    } else if (m.tipo === 'entrada') {
      add(m.data, [conta, m.origem === 'interna' ? 'Entrada de conta sua' : 'Entrada', descricao, m.origem === 'interna' ? '' : categoria(m.categoriaId), valor(m.valor), '', '', '', membro(m.membroId), '']);
    } else if (m.origem === 'fatura' && m.faturaId !== null && faturaPorId.has(m.faturaId)) {
      const fatura = faturaPorId.get(m.faturaId) as Fatura;
      faturasComSaida.add(fatura.id);
      add(m.data, [conta, 'Pagamento de fatura', descricao, '', valor(m.valor), cartaoPorId.get(fatura.cartaoId)?.nome ?? '', fatura.mesReferencia, '', membro(m.membroId), '']);
    } else if (m.origem === 'interna') {
      add(m.data, [conta, 'Saída para conta sua', descricao, '', valor(m.valor), '', '', '', membro(m.membroId), '']);
    } else {
      // conta fixa paga: a categoria é a da conta fixa
      const contaFixa = m.parcelaId !== null ? contaFixaPorId.get(parcelaPorId.get(m.parcelaId)?.contaFixaId ?? -1) : undefined;
      add(m.data, [conta, 'Saída', descricao, categoria(m.categoriaId ?? contaFixa?.categoriaId ?? null), valor(m.valor), '', '', '', membro(m.membroId), '']);
    }
  }
  for (const g of d.gastos) {
    const cartao = g.formaPagamento === 'cartao' && g.cartaoId !== null ? cartaoPorId.get(g.cartaoId) : undefined;
    if (cartao) {
      const mes = mesDeCobrancaDoGasto(g, cartaoPorId);
      add(g.data, [cartao.nome, g.valor < 0 ? 'Crédito no cartão' : 'Compra no cartão', g.descricao ?? '', categoria(g.categoriaId), valor(Math.abs(g.valor)), '', mes, '', membro(g.membroId), '']);
    } else {
      const conta = g.contaBancariaId !== null ? (nomeDaConta.get(g.contaBancariaId) ?? 'Dinheiro') : 'Dinheiro';
      add(g.data, [conta, 'Saída', g.descricao ?? '', categoria(g.categoriaId), valor(g.valor), '', '', '', membro(g.membroId), '']);
    }
  }
  for (const p of d.parcelas) {
    if (p.compraParceladaId === null) continue;
    const compra = compraPorId.get(p.compraParceladaId);
    const cartao = compra ? cartaoPorId.get(compra.cartaoId) : undefined;
    if (!compra || !cartao) continue;
    const mes = mesDeCobrancaDaParcela(p, contaFixaPorId, compraPorId, cartaoPorId);
    add(compra.dataCompra, [cartao.nome, 'Compra no cartão', compra.descricao, categoria(compra.categoriaId), valor(p.valor), '', mes, `${p.numero}/${compra.numParcelas}`, membro(compra.membroId), '']);
  }
  for (const f of d.faturas) {
    if (f.status !== 'paga' || faturasComSaida.has(f.id) || !f.dataPagamento) continue;
    const cartao = cartaoPorId.get(f.cartaoId);
    if (!cartao) continue;
    add(f.dataPagamento, [cartao.nome, 'Fatura paga', '', '', valor(f.valorPago ?? 0), '', f.mesReferencia, '', '', '']);
  }
  lancamentos.sort((a, b) => a.data.localeCompare(b.data));
  return montarCsvDaPlanilha([...declaracoes, ...lancamentos.map((l) => l.linha)]);
}
