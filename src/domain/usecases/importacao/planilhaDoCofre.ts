import { addDays, differenceInCalendarDays, format, getDaysInMonth, parseISO } from 'date-fns';
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
 * - Tipo: Conta, Cartão, Entrada, Entrada fixa, Saída, Gasto em dinheiro, Transferência,
 *   Entrada de conta sua, Saída para conta sua, Compra no cartão, Crédito no cartão,
 *   Pagamento de fatura, Fatura paga, Conta fixa;
 * - Descrição, Categoria (cria se não existir), Valor (sempre positivo; na linha Conta é o
 *   saldo inicial e pode ser negativo; na linha Cartão é o limite);
 * - Destino: a conta que recebe a transferência, ou o cartão da fatura paga;
 * - Fatura: mês de vencimento (aaaa-mm) da compra no cartão ou da fatura paga;
 * - Parcela: "3/10" (opcional); Membro (opcional); Observação (o app ignora);
 * - Id: quem exportou do app põe o id de cada lançamento (reimportar não duplica).
 * Na linha Cartão, a Descrição diz os dias: "fecha dia 1, vence dia 10".
 * Na linha Conta fixa: Data = primeiro vencimento; Conta ou cartão = de onde paga; Descrição =
 * nome; Destino = forma de pagamento (Pix, Débito, Boleto, Cartão), e se não for todo mês a
 * repetição ("Boleto · anual") e o dia quando a data não mostra ("Pix · dia 31"); Parcela =
 * quantas vezes ainda (vazia = sem fim).
 * Entrada fixa é uma entrada que se repete todo mês (o app prevê a do mês, como o salário).
 * Gasto em dinheiro é a despesa que não sai de nenhuma conta do app.
 * Compras no cartão com Parcela n/N que ainda têm parcelas por vir (ou estão numa fatura em
 * aberto) viram uma compra parcelada: as parcelas de faturas pagas ficam pagas; as que faltam
 * aparecem nos próximos meses. A compra que já terminou fica como está, cada parcela na fatura
 * em que veio.
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
  'Id',
] as const;

type Coluna = (typeof COLUNAS_DA_PLANILHA)[number];

export type TipoDaLinha =
  | 'conta'
  | 'cartao'
  | 'entrada'
  | 'entrada_fixa'
  | 'saida'
  | 'gasto_dinheiro'
  | 'transferencia'
  | 'entrada_interna'
  | 'saida_interna'
  | 'compra_cartao'
  | 'credito_cartao'
  | 'pagamento_fatura'
  | 'fatura_paga'
  | 'conta_fixa';

export const ROTULO_DO_TIPO_NA_PLANILHA: Record<TipoDaLinha, string> = {
  conta: 'Conta',
  cartao: 'Cartão',
  entrada: 'Entrada',
  entrada_fixa: 'Entrada fixa',
  saida: 'Saída',
  gasto_dinheiro: 'Gasto em dinheiro',
  transferencia: 'Transferência',
  entrada_interna: 'Entrada de conta sua',
  saida_interna: 'Saída para conta sua',
  compra_cartao: 'Compra no cartão',
  credito_cartao: 'Crédito no cartão',
  pagamento_fatura: 'Pagamento de fatura',
  fatura_paga: 'Fatura paga',
  conta_fixa: 'Conta fixa',
};

export type FormaDaContaFixa = 'pix' | 'debito' | 'boleto' | 'cartao';
type Recorrencia = ContaFixa['recorrencia'];

const ROTULO_DA_FORMA: Record<FormaDaContaFixa, string> = { pix: 'Pix', debito: 'Débito', boleto: 'Boleto', cartao: 'Cartão' };
const ROTULO_DA_RECORRENCIA: Record<Recorrencia, string> = { mensal: 'mensal', quinzenal: 'quinzenal', semanal: 'semanal', anual: 'anual', unica: 'única' };

function lerForma(texto: string | null): FormaDaContaFixa | null {
  const t = semAcentos(texto ?? '').toLowerCase();
  if (/pix/.test(t)) return 'pix';
  if (/debito/.test(t)) return 'debito';
  if (/boleto/.test(t)) return 'boleto';
  if (/cartao|credito/.test(t)) return 'cartao';
  return null;
}

function lerRecorrencia(texto: string | null): Recorrencia {
  const t = semAcentos(texto ?? '').toLowerCase();
  if (/quinzenal/.test(t)) return 'quinzenal';
  if (/semanal/.test(t)) return 'semanal';
  if (/anual/.test(t)) return 'anual';
  if (/\bunica\b|so uma vez/.test(t)) return 'unica';
  return 'mensal';
}

export type LinhaDaPlanilha = {
  /** Registro no arquivo (o 1 é o cabeçalho). */
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
  /** Id que o app pôs ao exportar (vira o id externo do lançamento). */
  id: string | null;
  /** Só na linha Conta fixa (coluna Destino). */
  formaPagamento?: FormaDaContaFixa;
  recorrencia?: Recorrencia;
  diaVencimento?: number;
};

export type ErroDaPlanilha = { numero: number; motivo: string };

const chave = (texto: string) => semAcentos(texto).toLowerCase().replace(/\s+/g, ' ').trim();

const TIPO_POR_ROTULO = new Map<string, TipoDaLinha>([
  ...(Object.entries(ROTULO_DO_TIPO_NA_PLANILHA) as [TipoDaLinha, string][]).map(([tipo, rotulo]) => [chave(rotulo), tipo] as const),
  ['receita', 'entrada'],
  ['receita fixa', 'entrada_fixa'],
  ['despesa', 'saida'],
  ['gasto', 'saida'],
  ['dinheiro', 'gasto_dinheiro'],
  ['compra', 'compra_cartao'],
  ['estorno no cartao', 'credito_cartao'],
  ['saida para conta propria', 'saida_interna'],
  ['entrada de conta propria', 'entrada_interna'],
]);

/**
 * Registros do CSV com ";", como o Excel grava: campo entre aspas pode ter ";", quebra de
 * linha e aspas dobradas ("").
 */
function registrosDoCsv(texto: string): string[][] {
  const registros: string[][] = [];
  let campos: string[] = [];
  let atual = '';
  let aspas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') {
      campos.push(atual.trim());
      atual = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      campos.push(atual.trim());
      registros.push(campos);
      campos = [];
      atual = '';
    } else atual += c;
  }
  if (atual !== '' || campos.length > 0) {
    campos.push(atual.trim());
    registros.push(campos);
  }
  return registros;
}

/** É a planilha do Cofre (pelo cabeçalho)? */
export function ehPlanilhaDoCofre(texto: string): boolean {
  const primeira = registrosDoCsv(texto.slice(0, 2000)).find((r) => r.some((c) => c !== ''));
  if (!primeira) return false;
  const colunas = primeira.map(chave);
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
  const porNome = t.match(/^([a-z]{3})[a-z]*\.?(?:\s*de\s*|[/\-\s])(\d{2,4})$/);
  if (porNome && MESES_ABREVIADOS.includes(porNome[1])) return mes(MESES_ABREVIADOS.indexOf(porNome[1]) + 1, Number(porNome[2]));
  return null;
}

/** Parcela: "3/10", "3 de 10" e o "03/abr" que o Excel grava quando entende "3/4" como data. */
export function lerParcela(texto: string): { numero: number; total: number } | null {
  const t = semAcentos(texto).toLowerCase().trim();
  const simples = t.match(/^(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})$/);
  if (simples) return { numero: Number(simples[1]), total: Number(simples[2]) };
  const comoData = t.match(/^(\d{1,2})[/-]([a-z]{3})[a-z]*\.?$/);
  if (comoData && MESES_ABREVIADOS.includes(comoData[2])) return { numero: Number(comoData[1]), total: MESES_ABREVIADOS.indexOf(comoData[2]) + 1 };
  return null;
}

/** Lê a planilha: as linhas válidas e, para as outras, o motivo (com o número do registro). */
export function lerPlanilhaDoCofre(texto: string): { linhas: LinhaDaPlanilha[]; erros: ErroDaPlanilha[] } {
  const registros = registrosDoCsv(texto);
  const cabecalho = (registros[0] ?? []).map(chave);
  const posicao = Object.fromEntries(COLUNAS_DA_PLANILHA.map((c) => [c, cabecalho.indexOf(chave(c))])) as Record<Coluna, number>;
  const linhas: LinhaDaPlanilha[] = [];
  const erros: ErroDaPlanilha[] = [];

  registros.slice(1).forEach((campos, i) => {
    const numero = i + 2;
    if (campos.every((c) => c === '')) return;
    const campo = (nome: Coluna) => (posicao[nome] >= 0 ? (campos[posicao[nome]] ?? '').trim() : '');
    const tipo = TIPO_POR_ROTULO.get(chave(campo('Tipo')));
    if (!tipo) {
      erros.push({ numero, motivo: `Tipo "${campo('Tipo')}" não reconhecido` });
      return;
    }
    const onde = campo('Conta ou cartão') || (tipo === 'gasto_dinheiro' ? 'Dinheiro' : '');
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
    // na conta fixa, "Parcela" é quantas vezes ainda ("7", "7x", "1/7"); vazia = sem fim
    const vezes = tipo === 'conta_fixa' ? (campo('Parcela').match(/(\d{1,3})\D*$/)?.[1] ?? null) : null;
    const parcela = tipo === 'conta_fixa' ? (vezes ? { numero: 1, total: Number(vezes) } : null) : campo('Parcela') ? lerParcela(campo('Parcela')) : null;
    const extrasDaContaFixa: Partial<LinhaDaPlanilha> = {};
    if (tipo === 'conta_fixa') {
      const forma = lerForma(destino);
      if (forma) extrasDaContaFixa.formaPagamento = forma;
      extrasDaContaFixa.recorrencia = lerRecorrencia(destino);
      const dia = Number(semAcentos(destino ?? '').toLowerCase().match(/\bdia (\d{1,2})\b/)?.[1] ?? (data as string).slice(8, 10));
      extrasDaContaFixa.diaVencimento = Math.min(31, Math.max(1, dia));
    }
    linhas.push({
      numero,
      data,
      onde,
      tipo,
      descricao: campo('Descrição'),
      categoria: campo('Categoria') || null,
      valor: tipo === 'conta' ? valor : Math.abs(valor),
      destino,
      fatura,
      parcela,
      membro: campo('Membro') || null,
      observacao: campo('Observação') || null,
      id: campo('Id') || null,
      ...extrasDaContaFixa,
    });
  });
  return { linhas, erros };
}

// ---------------------------------------------------------------- o que a importação vai criar

const ONDE_EH_CARTAO = new Set<TipoDaLinha>(['cartao', 'compra_cartao', 'credito_cartao', 'fatura_paga']);
/** Não precisam de conta nem de cartão em "Conta ou cartão". */
const SEM_CONTA = new Set<TipoDaLinha>(['gasto_dinheiro']);

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
  if (tipo === 'entrada' || tipo === 'entrada_fixa') return 'receita';
  if (tipo === 'saida' || tipo === 'gasto_dinheiro' || tipo === 'compra_cartao' || tipo === 'credito_cartao' || tipo === 'conta_fixa') return 'despesa';
  return null;
}

/** A conta fixa é paga no cartão (o nome em "Conta ou cartão" é de um cartão)? */
const contaFixaNoCartao = (l: LinhaDaPlanilha) => l.tipo === 'conta_fixa' && l.formaPagamento === 'cartao';

/** "LOJA X (3/4)" ou "LOJA X PARC03/04" → "LOJA X": o nome da compra, sem a parcela. */
export function descricaoSemParcela(descricao: string): string {
  return descricao
    .replace(/\s*\(\s*\d{1,3}\s*\/\s*\d{1,3}\s*\)\s*$/, '')
    .replace(/\s*PARC\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/i, '')
    .trim();
}

/** Quantos meses de `a` até `b` ('aaaa-mm'). */
function diferencaDeMeses(a: string, b: string): number {
  const [anoA, mesA] = a.split('-').map(Number);
  const [anoB, mesB] = b.split('-').map(Number);
  return (anoB - anoA) * 12 + (mesB - mesA);
}

/** Mês 'aaaa-mm' n meses antes (ou depois, com n negativo). */
function mesMenos(mes: string, n: number): string {
  const [ano, m] = mes.split('-').map(Number);
  const total = ano * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
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
  contasFixas: { nome: string; valor: number; dia: number; vezes: number | null }[];
  /** Compras parceladas que as linhas "Compra no cartão" com parcela n/N vão formar. */
  comprasParceladas: number;
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
  const contasFixas: PlanoDaPlanilha['contasFixas'] = [];
  const parceladas = new Map<string, { ultima: number; total: number; emAberto: boolean }>();
  const faturasPagas = new Set(
    linhas
      .filter((l) => (l.tipo === 'pagamento_fatura' || l.tipo === 'fatura_paga') && l.fatura)
      .map((l) => `${chave(l.tipo === 'pagamento_fatura' ? (l.destino ?? '') : l.onde)}|${l.fatura}`)
  );
  for (const l of linhas) {
    if (l.tipo === 'conta' || l.tipo === 'cartao') continue;
    if (l.tipo === 'conta_fixa') {
      contasFixas.push({ nome: l.descricao || 'Conta fixa', valor: l.valor, dia: l.diaVencimento ?? Number((l.data ?? '').slice(8, 10)), vezes: l.parcela?.total ?? null });
      if (!l.formaPagamento) avisos.push(`Linha ${l.numero}: conta fixa "${l.descricao}" sem forma de pagamento: vai como Pix.`);
    } else if (l.data) datas.push(l.data);
    if (l.tipo === 'compra_cartao' && l.parcela && l.parcela.total > 1) {
      const k = `${chave(l.onde)}|${chave(descricaoSemParcela(l.descricao))}|${l.parcela.total}|${Math.round(l.valor / 100)}`;
      const atual = parceladas.get(k) ?? { ultima: 0, total: l.parcela.total, emAberto: false };
      parceladas.set(k, {
        ultima: Math.max(atual.ultima, l.parcela.numero),
        total: l.parcela.total,
        emAberto: atual.emAberto || !l.fatura || !faturasPagas.has(`${chave(l.onde)}|${l.fatura}`),
      });
    }
    if (ONDE_EH_CARTAO.has(l.tipo) || contaFixaNoCartao(l)) precisaCartao(l.onde);
    else if (!SEM_CONTA.has(l.tipo)) precisaConta(l.onde);
    if (l.tipo === 'transferencia' && l.destino) precisaConta(l.destino);
    if (l.tipo === 'pagamento_fatura' && l.destino) precisaCartao(l.destino);
    const natureza = naturezaDaLinha(l.tipo);
    if (natureza && l.categoria && !categoriasExistentes.has(`${natureza}|${chave(l.categoria)}`)) {
      categoriasNovas.set(`${natureza}|${chave(l.categoria)}`, { nome: l.categoria, tipo: natureza });
    }
    if (l.membro && !membrosExistentes.has(chave(l.membro))) membrosDesconhecidos.add(l.membro);
    if (l.tipo === 'entrada' || l.tipo === 'entrada_fixa') totais.entradas += l.valor;
    if (l.tipo === 'saida' || l.tipo === 'gasto_dinheiro') totais.saidas += l.valor;
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
    contasFixas,
    comprasParceladas: [...parceladas.values()].filter((p) => p.ultima < p.total || p.emAberto).length,
    avisos,
    totais,
    lancamentos: linhas.filter((l) => l.tipo !== 'conta' && l.tipo !== 'cartao' && l.tipo !== 'conta_fixa').length,
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
  /** Lançamentos do app (o Id "app:mov:12" de uma planilha exportada deste aparelho). */
  movimentacoes?: Pick<Movimentacao, 'id' | 'valor' | 'data'>[];
  gastos?: Pick<GastoRapido, 'id' | 'valor' | 'data'>[];
  /** Contas fixas, compras parceladas e faturas que já estão no app (não cria de novo). */
  contasFixas?: Pick<ContaFixa, 'nome' | 'ativo'>[];
  comprasParceladas?: Pick<CompraParcelada, 'cartaoId' | 'descricao' | 'numParcelas' | 'valorTotal'>[];
  faturas?: Pick<Fatura, 'cartaoId' | 'mesReferencia' | 'status' | 'valorPago'>[];
};

export type RegistroDaPlanilha = RegistroDeImportacao & { jaImportadas: number };

/** Fim da conta fixa com `vezes` ocorrências a partir de `inicio` (o dia respeita o tamanho do mês). */
function fimDaContaFixa(inicio: string, dia: number, vezes: number, recorrencia: Recorrencia): string | null {
  if (recorrencia === 'unica') return null;
  if (recorrencia === 'semanal' || recorrencia === 'quinzenal') {
    return format(addDays(parseISO(inicio), (recorrencia === 'semanal' ? 7 : 14) * (vezes - 1)), 'yyyy-MM-dd');
  }
  const passo = recorrencia === 'anual' ? 12 : 1;
  return dataNoMes(mesMenos(inicio.slice(0, 7), -passo * (vezes - 1)), dia);
}

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
  const movPorId = new Map((ids.movimentacoes ?? []).map((m) => [m.id, m]));
  const gastoPorId = new Map((ids.gastos ?? []).map((g) => [g.id, g]));
  const categoriaDe = (l: LinhaDaPlanilha) => {
    const natureza = naturezaDaLinha(l.tipo);
    return natureza && l.categoria ? (categoriaPorNome.get(`${natureza}|${chave(l.categoria)}`) ?? null) : null;
  };
  const membroDe = (l: LinhaDaPlanilha) => (l.membro ? (membroPorNome.get(chave(l.membro)) ?? null) : null);
  const umCartao = (id: number) => new Map(ids.cartoes.filter((c) => c.id === id).map((c) => [c.id, c]));

  const lancamentos = linhas.filter((l) => l.tipo !== 'conta' && l.tipo !== 'cartao' && l.tipo !== 'conta_fixa');

  // id externo de cada lançamento: o que o app pôs ao exportar, ou o hash da linha
  const repeticoes = new Map<string, number>();
  const idExternoDe = new Map<LinhaDaPlanilha, string>();
  for (const l of lancamentos) {
    const base = [l.data, chave(l.onde), l.tipo, chave(l.descricao), l.valor, chave(l.destino ?? ''), l.fatura ?? '', l.parcela ? `${l.parcela.numero}/${l.parcela.total}` : ''].join('|');
    const vez = (repeticoes.get(base) ?? 0) + 1;
    repeticoes.set(base, vez);
    idExternoDe.set(l, l.id ?? `cofre:${hash(base)}:${vez}`);
  }
  /** Já está no app: pelo id externo, ou pelo Id "app:mov:12" de uma planilha exportada deste aparelho (mesmo valor e data). */
  const jaNoApp = (l: LinhaDaPlanilha) => {
    const id = idExternoDe.get(l) as string;
    if (ids.idsExternos.has(id)) return true;
    const doApp = id.match(/^app:(mov|gasto):(\d+)$/);
    if (!doApp) return false;
    const existente = doApp[1] === 'mov' ? movPorId.get(Number(doApp[2])) : gastoPorId.get(Number(doApp[2]));
    return existente !== undefined && Math.abs(existente.valor) === l.valor && existente.data === l.data;
  };

  // faturas pagas na planilha (para as parcelas das compras parceladas ficarem pagas)
  const faturasPagasNaPlanilha = new Map<string, string>();
  const primeiroMesDoCartao = new Map<number, string>();
  for (const l of lancamentos) {
    const cartao = cartaoPorNome.get(chave(l.tipo === 'pagamento_fatura' ? (l.destino ?? '') : l.onde));
    if (!cartao) continue;
    if ((l.tipo === 'pagamento_fatura' || l.tipo === 'fatura_paga') && l.fatura) {
      const k = `${cartao.id}|${l.fatura}`;
      if ((faturasPagasNaPlanilha.get(k) ?? '') < (l.data ?? '')) faturasPagasNaPlanilha.set(k, l.data as string);
    }
    if (l.tipo === 'compra_cartao' || l.tipo === 'credito_cartao') {
      const mes = l.fatura ?? mesDeCobrancaDoGasto({ data: l.data as string, formaPagamento: 'cartao', cartaoId: cartao.id }, umCartao(cartao.id));
      if (!primeiroMesDoCartao.has(cartao.id) || mes < (primeiroMesDoCartao.get(cartao.id) as string)) primeiroMesDoCartao.set(cartao.id, mes);
    }
  }

  // compras com parcela n/N: as linhas da mesma compra (mesmo cartão, nome, N, valor parecido e
  // 1ª fatura com até 1 mês de folga — o banco às vezes pula um mês)
  type Grupo = {
    cartao: IdsParaPlanilha['cartoes'][number];
    descricao: string;
    total: number;
    inicio: string;
    linhas: { linha: LinhaDaPlanilha; numero: number; mes: string }[];
  };
  const grupos: Grupo[] = [];
  for (const l of lancamentos) {
    if (l.tipo !== 'compra_cartao' || !l.parcela || l.parcela.total < 2) continue;
    const cartao = cartaoPorNome.get(chave(l.onde));
    if (!cartao) continue;
    const { numero, total } = l.parcela;
    const mes = l.fatura ?? mesDeCobrancaDoGasto({ data: l.data as string, formaPagamento: 'cartao', cartaoId: cartao.id }, umCartao(cartao.id));
    const inicio = mesMenos(mes, numero - 1);
    const descricao = descricaoSemParcela(l.descricao) || 'Compra parcelada';
    const grupo = grupos.find(
      (g) =>
        g.cartao.id === cartao.id &&
        g.total === total &&
        Math.abs(diferencaDeMeses(g.inicio, inicio)) <= 1 &&
        chave(g.descricao) === chave(descricao) &&
        !g.linhas.some((x) => x.numero === numero) &&
        g.linhas.some((x) => Math.abs(x.linha.valor - l.valor) <= Math.max(200, x.linha.valor * 0.03))
    );
    if (grupo) {
      grupo.linhas.push({ linha: l, numero, mes });
      // as próximas parcelas seguem a última que veio
      const ultima = grupo.linhas.reduce((a, b) => (b.numero > a.numero ? b : a));
      grupo.inicio = mesMenos(ultima.mes, ultima.numero - 1);
    } else grupos.push({ cartao, descricao, total, inicio, linhas: [{ linha: l, numero, mes }] });
  }

  let jaImportadas = 0;
  const emParcelas = new Set<LinhaDaPlanilha>();
  const comprasParceladas: NonNullable<RegistroDeImportacao['comprasParceladas']> = [];
  /** Faturas de parcelas pagas que a planilha não registra (de antes dela): ficam pagas também. */
  const pagasSemRegistro = new Map<string, { cartao: Grupo['cartao']; mes: string; valor: number }>();
  for (const g of grupos) {
    const conhecidas = [...g.linhas].sort((a, b) => a.numero - b.numero);
    // parcela que não está na planilha: o valor da conhecida mais perto
    const valores = Array.from({ length: g.total }, (_, i) => {
      const n = i + 1;
      return [...conhecidas].sort((a, b) => Math.abs(a.numero - n) - Math.abs(b.numero - n) || b.numero - a.numero)[0].linha.valor;
    });
    const valorTotal = valores.reduce((s, v) => s + v, 0);
    const jaExiste = (ids.comprasParceladas ?? []).some(
      (c) => c.cartaoId === g.cartao.id && c.numParcelas === g.total && chave(c.descricao) === chave(g.descricao) && Math.abs(c.valorTotal - valorTotal) <= g.total * 200
    );
    if (jaExiste) {
      for (const x of g.linhas) emParcelas.add(x.linha);
      jaImportadas += g.linhas.length;
      continue;
    }
    // compra que já terminou em faturas pagas fica como está (cada parcela na sua fatura)
    const porVir = Math.max(...g.linhas.map((x) => x.numero)) < g.total || g.linhas.some((x) => !faturasPagasNaPlanilha.has(`${g.cartao.id}|${x.mes}`));
    if (!porVir) continue;
    for (const x of g.linhas) emParcelas.add(x.linha);
    const primeira = conhecidas[0].linha;
    const primeiroMes = primeiroMesDoCartao.get(g.cartao.id) ?? g.inicio;
    const pagas = valores.flatMap((valor, i) => {
      const mes = mesMenos(g.inicio, -i);
      const pagaEm = faturasPagasNaPlanilha.get(`${g.cartao.id}|${mes}`);
      if (pagaEm) return [{ numero: i + 1, dataPagamento: pagaEm }];
      // parcela de antes da primeira fatura da planilha já foi paga
      if (mes < primeiroMes) {
        const k = `${g.cartao.id}|${mes}`;
        const atual = pagasSemRegistro.get(k) ?? { cartao: g.cartao, mes, valor: 0 };
        atual.valor += valor;
        pagasSemRegistro.set(k, atual);
        return [{ numero: i + 1, dataPagamento: dataNoMes(mes, g.cartao.diaVencimento) }];
      }
      return [];
    });
    comprasParceladas.push({
      dados: {
        descricao: g.descricao,
        valorTotal,
        numParcelas: g.total,
        cartaoId: g.cartao.id,
        categoriaId: categoriaDe(primeira),
        dataCompra: [...g.linhas].map((x) => x.linha.data as string).sort()[0],
        membroId: membroDe(primeira),
      },
      mesPrimeiraParcela: dataFechamentoDaFatura(g.inicio, g.cartao).slice(0, 7),
      valores,
      pagas,
    });
  }

  // contas fixas
  const contasFixas: NonNullable<RegistroDeImportacao['contasFixas']> = [];
  for (const l of linhas) {
    if (l.tipo !== 'conta_fixa' || !l.data) continue;
    const nome = l.descricao || 'Conta fixa';
    if ((ids.contasFixas ?? []).some((c) => c.ativo !== false && chave(c.nome) === chave(nome))) {
      jaImportadas++;
      continue;
    }
    const forma = l.formaPagamento ?? 'pix';
    const noCartao = forma === 'cartao' ? cartaoPorNome.get(chave(l.onde)) : undefined;
    const recorrencia = l.recorrencia ?? 'mensal';
    const dia = l.diaVencimento ?? Number(l.data.slice(8, 10));
    contasFixas.push({
      nome,
      categoriaId: categoriaDe(l),
      valor: l.valor,
      diaVencimento: dia,
      formaPagamento: forma,
      contaBancariaId: noCartao ? null : (contaPorNome.get(chave(l.onde)) ?? null),
      cartaoId: noCartao?.id ?? null,
      recorrencia,
      dataInicio: l.data,
      dataFim: l.parcela ? fimDaContaFixa(l.data, dia, l.parcela.total, recorrencia) : null,
      membroId: membroDe(l),
    });
  }

  // entrada fixa: só a última de cada uma (mesma conta, descrição e categoria) é o modelo que se repete
  const ultimaEntradaFixa = new Map<string, LinhaDaPlanilha>();
  for (const l of lancamentos) {
    if (l.tipo !== 'entrada_fixa') continue;
    const k = `${chave(l.onde)}|${chave(l.descricao)}|${chave(l.categoria ?? '')}`;
    const atual = ultimaEntradaFixa.get(k);
    if (!atual || (atual.data ?? '') <= (l.data ?? '')) ultimaEntradaFixa.set(k, l);
  }
  const modelos = new Set(ultimaEntradaFixa.values());

  const movimentacoes: DadosMovimentacao[] = [];
  const gastos: DadosGastoRapido[] = [];
  type Pagamento = { linha: LinhaDaPlanilha; contaId: number | null; idExterno: string; noApp: boolean };
  const pagamentosPorFatura = new Map<string, { cartao: IdsParaPlanilha['cartoes'][number]; mes: string; itens: Pagamento[] }>();
  const guardarPagamento = (cartao: IdsParaPlanilha['cartoes'][number], l: LinhaDaPlanilha, contaId: number | null) => {
    const k = `${cartao.id}|${l.fatura}`;
    const grupo = pagamentosPorFatura.get(k) ?? { cartao, mes: l.fatura as string, itens: [] };
    grupo.itens.push({ linha: l, contaId, idExterno: idExternoDe.get(l) as string, noApp: jaNoApp(l) });
    pagamentosPorFatura.set(k, grupo);
  };

  for (const l of lancamentos) {
    if (emParcelas.has(l)) continue;
    // os pagamentos de fatura são vistos juntos, mais abaixo (o valor pago é o de todos)
    if (l.tipo === 'fatura_paga' || l.tipo === 'pagamento_fatura') {
      const cartao = cartaoPorNome.get(chave(l.tipo === 'fatura_paga' ? l.onde : (l.destino ?? '')));
      const contaId = l.tipo === 'pagamento_fatura' ? contaPorNome.get(chave(l.onde)) : null;
      if (cartao && contaId !== undefined) guardarPagamento(cartao, l, contaId);
      continue;
    }
    if (jaNoApp(l)) {
      jaImportadas++;
      continue;
    }
    const idExterno = idExternoDe.get(l) as string;
    const data = l.data as string;
    const categoriaId = categoriaDe(l);
    const membroId = membroDe(l);
    const descricao = l.descricao || ROTULO_DO_TIPO_NA_PLANILHA[l.tipo];

    if (l.tipo === 'gasto_dinheiro') {
      gastos.push({ valor: l.valor, data, formaPagamento: 'dinheiro', contaBancariaId: null, cartaoId: null, categoriaId, descricao, membroId, idExterno });
      continue;
    }
    if (ONDE_EH_CARTAO.has(l.tipo)) {
      const cartao = cartaoPorNome.get(chave(l.onde));
      if (!cartao) continue;
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
    const comum = { contaBancariaId: contaId, valor: l.valor, data, descricao, membroId, idExterno };
    if (l.tipo === 'transferencia') {
      const destinoId = contaPorNome.get(chave(l.destino ?? ''));
      if (destinoId === undefined) continue;
      movimentacoes.push({ ...comum, tipo: 'transferencia', contaDestinoId: destinoId, origem: 'manual', categoriaId: null });
    } else if (l.tipo === 'entrada' || l.tipo === 'entrada_fixa' || l.tipo === 'entrada_interna') {
      movimentacoes.push({
        ...comum,
        tipo: 'entrada',
        origem: l.tipo === 'entrada_interna' ? 'interna' : 'manual',
        categoriaId,
        ...(modelos.has(l) ? { recorrente: true } : {}),
      });
    } else {
      movimentacoes.push({ ...comum, tipo: 'saida', origem: l.tipo === 'saida_interna' ? 'interna' : 'manual', categoriaId });
    }
  }

  // faturas pagas: o valor pago é a soma de todos os pagamentos dela na planilha (também os que
  // já estão no app); cada pagamento de uma conta é uma saída ligada, menos os que já estão no app
  const pagamentosDeFatura: RegistroDeImportacao['pagamentosDeFatura'] = [];
  const faturasPagas: PagamentoFatura[] = [];
  const pagamentoDa = (cartao: Grupo['cartao'], mes: string, valorPago: number, dataPagamento: string, contaBancariaId: number | null): PagamentoFatura => ({
    cartaoId: cartao.id,
    mesReferencia: mes,
    dataFechamento: dataFechamentoDaFatura(mes, cartao),
    dataVencimento: dataNoMes(mes, cartao.diaVencimento),
    contaBancariaId,
    valorPago,
    dataPagamento,
  });
  const faturaJaPaga = (cartaoId: number, mes: string, valor: number) =>
    (ids.faturas ?? []).some((f) => f.cartaoId === cartaoId && f.mesReferencia === mes && f.status === 'paga' && (f.valorPago ?? 0) >= valor);
  for (const { cartao, mes, itens } of pagamentosPorFatura.values()) {
    const ordenados = [...itens].sort((a, b) => (a.linha.data ?? '').localeCompare(b.linha.data ?? ''));
    const maior = [...itens].filter((i) => i.contaId !== null).sort((a, b) => b.linha.valor - a.linha.valor)[0];
    const valorPago = itens.reduce((s, i) => s + i.linha.valor, 0);
    const pagamento = pagamentoDa(cartao, mes, valorPago, ordenados[ordenados.length - 1].linha.data as string, maior?.contaId ?? null);
    const novos = itens.filter((i) => i.contaId !== null && !i.noApp);
    jaImportadas += itens.filter((i) => i.contaId !== null && i.noApp).length;
    if (novos.length === 0) {
      // só "Fatura paga" (ou pagamentos que já estão no app): regrava se o app não tem a fatura paga com esse valor
      if (faturaJaPaga(cartao.id, mes, valorPago)) jaImportadas += itens.filter((i) => i.contaId === null).length;
      else faturasPagas.push(pagamento);
      continue;
    }
    for (const item of novos) {
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
          membroId: membroDe(item.linha),
          idExterno: item.idExterno,
        },
      });
    }
  }
  for (const { cartao, mes, valor } of pagasSemRegistro.values()) {
    if (pagamentosPorFatura.has(`${cartao.id}|${mes}`) || faturaJaPaga(cartao.id, mes, valor)) continue;
    faturasPagas.push(pagamentoDa(cartao, mes, valor, dataNoMes(mes, cartao.diaVencimento), null));
  }

  const datas = lancamentos.map((l) => l.data as string).sort();
  const importadas =
    movimentacoes.length +
    gastos.length +
    pagamentosDeFatura.length +
    faturasPagas.length +
    comprasParceladas.reduce((s, c) => s + c.valores.length, 0) +
    contasFixas.length;
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
    comprasParceladas,
    contasFixas,
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
  /** Todas, também as desativadas (os lançamentos delas precisam de um lugar para voltar). */
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
 * Tudo o que está no app neste formato: as contas (com o saldo inicial), os cartões, as contas
 * fixas ativas (a partir da ocorrência em aberto mais antiga), cada movimentação, gasto, parcela
 * de compra, ocorrência de conta fixa paga e fatura paga. Importar este arquivo num app vazio
 * refaz os mesmos saldos e relatórios; cofrinhos e reserva não entram. A coluna Id leva o id de
 * cada lançamento: reimportar no mesmo aparelho não duplica.
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
  const faturaPaga = (cartaoId: number, mes: string) => d.faturas.some((f) => f.cartaoId === cartaoId && f.mesReferencia === mes && f.status === 'paga');

  const declaracoes: string[][] = [
    ...d.contas.map((c) => ['', c.nomeConta, 'Conta', c.banco, '', valor(c.saldoInicial), '', '', '', '', c.ativo === false ? 'desativada no app' : '', '']),
    ...d.cartoes.map((c) => [
      '',
      c.nome,
      'Cartão',
      `fecha dia ${c.diaFechamento}, vence dia ${c.diaVencimento}`,
      '',
      valor(c.limite),
      '',
      '',
      '',
      '',
      c.ativo === false ? 'desativado no app' : '',
      '',
    ]),
  ];
  const lancamentos: { data: string; linha: string[] }[] = [];
  const add = (data: string, linha: string[]) => lancamentos.push({ data, linha: [formatarData(data), ...linha] });

  // entrada que se repete: só a mais recente de cada uma sai como "Entrada fixa"
  const familia = (m: Movimentacao) => (m.recorrenteOrigemId !== null ? m.recorrenteOrigemId : m.recorrente ? m.id : null);
  const maisRecente = new Map<number, Movimentacao>();
  for (const m of d.movimentacoes) {
    const f = m.tipo === 'entrada' ? familia(m) : null;
    if (f === null) continue;
    const atual = maisRecente.get(f);
    if (!atual || atual.data <= m.data) maisRecente.set(f, m);
  }
  const modelos = new Set(maisRecente.values());

  const faturasComSaida = new Set<number>();
  const parcelasComSaida = new Set<number>();
  for (const m of d.movimentacoes) {
    const conta = nomeDaConta.get(m.contaBancariaId) ?? `Conta ${m.contaBancariaId}`;
    const descricao = m.descricao ?? '';
    const id = m.idExterno ?? `app:mov:${m.id}`;
    if (m.parcelaId !== null) parcelasComSaida.add(m.parcelaId);
    if (m.tipo === 'transferencia') {
      add(m.data, [conta, 'Transferência', descricao, '', valor(m.valor), nomeDaConta.get(m.contaDestinoId ?? -1) ?? '', '', '', membro(m.membroId), '', id]);
    } else if (m.tipo === 'entrada') {
      const tipo = m.origem === 'interna' ? 'Entrada de conta sua' : modelos.has(m) ? 'Entrada fixa' : 'Entrada';
      add(m.data, [conta, tipo, descricao, m.origem === 'interna' ? '' : categoria(m.categoriaId), valor(m.valor), '', '', '', membro(m.membroId), '', id]);
    } else if (m.origem === 'fatura' && m.faturaId !== null && faturaPorId.has(m.faturaId)) {
      const fatura = faturaPorId.get(m.faturaId) as Fatura;
      faturasComSaida.add(fatura.id);
      add(m.data, [conta, 'Pagamento de fatura', descricao, '', valor(m.valor), cartaoPorId.get(fatura.cartaoId)?.nome ?? '', fatura.mesReferencia, '', membro(m.membroId), '', id]);
    } else if (m.origem === 'interna') {
      add(m.data, [conta, 'Saída para conta sua', descricao, '', valor(m.valor), '', '', '', membro(m.membroId), '', id]);
    } else {
      // conta fixa paga: a categoria é a da conta fixa
      const contaFixa = m.parcelaId !== null ? contaFixaPorId.get(parcelaPorId.get(m.parcelaId)?.contaFixaId ?? -1) : undefined;
      add(m.data, [conta, 'Saída', descricao, categoria(m.categoriaId ?? contaFixa?.categoriaId ?? null), valor(m.valor), '', '', '', membro(m.membroId), '', id]);
    }
  }
  for (const g of d.gastos) {
    const id = g.idExterno ?? `app:gasto:${g.id}`;
    const cartao = g.formaPagamento === 'cartao' && g.cartaoId !== null ? cartaoPorId.get(g.cartaoId) : undefined;
    if (cartao) {
      const mes = mesDeCobrancaDoGasto(g, cartaoPorId);
      add(g.data, [cartao.nome, g.valor < 0 ? 'Crédito no cartão' : 'Compra no cartão', g.descricao ?? '', categoria(g.categoriaId), valor(Math.abs(g.valor)), '', mes, '', membro(g.membroId), '', id]);
    } else if ((g.formaPagamento === 'debito' || g.formaPagamento === 'pix') && g.contaBancariaId !== null && nomeDaConta.has(g.contaBancariaId)) {
      // débito/PIX de uma conta sai do saldo dela (como em calcularSaldoConta)
      add(g.data, [nomeDaConta.get(g.contaBancariaId) as string, 'Saída', g.descricao ?? '', categoria(g.categoriaId), valor(g.valor), '', '', '', membro(g.membroId), '', id]);
    } else {
      add(g.data, ['Dinheiro', 'Gasto em dinheiro', g.descricao ?? '', categoria(g.categoriaId), valor(g.valor), '', '', '', membro(g.membroId), '', id]);
    }
  }

  // parcelas pagas sem a fatura registrada (paga) no app: a planilha diz que a fatura foi paga
  const pagasSemFatura = new Map<string, { cartao: Cartao; mes: string; valor: number; data: string }>();
  const anotarPagaSemFatura = (cartao: Cartao, mes: string, valorDaParcela: number, data: string | null) => {
    if (faturaPaga(cartao.id, mes)) return;
    const k = `${cartao.id}|${mes}`;
    const atual = pagasSemFatura.get(k) ?? { cartao, mes, valor: 0, data: data ?? dataNoMes(mes, cartao.diaVencimento) };
    atual.valor += valorDaParcela;
    pagasSemFatura.set(k, atual);
  };
  for (const p of d.parcelas) {
    if (p.compraParceladaId === null) continue;
    const compra = compraPorId.get(p.compraParceladaId);
    const cartao = compra ? cartaoPorId.get(compra.cartaoId) : undefined;
    if (!compra || !cartao) continue;
    const mes = mesDeCobrancaDaParcela(p, contaFixaPorId, compraPorId, cartaoPorId);
    add(compra.dataCompra, [
      cartao.nome,
      'Compra no cartão',
      compra.descricao,
      categoria(compra.categoriaId),
      valor(p.valor),
      '',
      mes,
      `${p.numero}/${compra.numParcelas}`,
      membro(compra.membroId),
      '',
      `app:parcela:${p.id}`,
    ]);
    if (p.status === 'paga') anotarPagaSemFatura(cartao, mes, p.valor, p.dataPagamento);
  }

  // contas fixas ativas: a partir da ocorrência em aberto mais antiga, com quantas vezes ainda;
  // as ocorrências de antes disso voltam como o que foram (compra no cartão, gasto pago fora do app)
  const fixas: string[][] = [];
  for (const c of d.contasFixas) {
    const ocorrencias = d.parcelas.filter((p) => p.contaFixaId === c.id).sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia));
    const abertas = ocorrencias.filter((p) => p.status !== 'paga');
    const ultima = ocorrencias[ocorrencias.length - 1];
    const inicio = abertas[0]?.mesReferencia ?? (ultima ? mesMenos(ultima.mesReferencia, -1) : c.dataInicio.slice(0, 7));
    const cartao = c.formaPagamento === 'cartao' && c.cartaoId !== null ? cartaoPorId.get(c.cartaoId) : undefined;

    for (const p of ocorrencias) {
      if (p.mesReferencia >= inicio && p.status !== 'paga') continue;
      if (cartao) {
        const mes = mesDeCobrancaDaParcela(p, contaFixaPorId, compraPorId, cartaoPorId);
        add(dataNoMes(p.mesReferencia, c.diaVencimento), [cartao.nome, 'Compra no cartão', c.nome, categoria(c.categoriaId), valor(p.valor), '', mes, '', membro(c.membroId), 'conta fixa', `app:parcela:${p.id}`]);
        if (p.status === 'paga') anotarPagaSemFatura(cartao, mes, p.valor, p.dataPagamento);
      } else if (p.status === 'paga' && !parcelasComSaida.has(p.id)) {
        add(p.dataPagamento ?? dataNoMes(p.mesReferencia, c.diaVencimento), ['Dinheiro', 'Gasto em dinheiro', c.nome, categoria(c.categoriaId), valor(p.valor), '', '', '', membro(c.membroId), 'conta fixa paga fora do app', `app:parcela:${p.id}`]);
      }
    }

    if (c.ativo === false) continue;
    if (c.recorrencia === 'unica' && abertas.length === 0) continue;
    if (c.dataFim && inicio > c.dataFim.slice(0, 7)) continue;
    const [anoA, mesA] = inicio.split('-').map(Number);
    const meses = c.dataFim ? (Number(c.dataFim.slice(0, 4)) - anoA) * 12 + Number(c.dataFim.slice(5, 7)) - mesA : 0;
    const vezes =
      c.recorrencia === 'unica'
        ? null
        : !c.dataFim
          ? null
          : c.recorrencia === 'anual'
            ? Math.floor(meses / 12) + 1
            : c.recorrencia === 'mensal'
              ? meses + 1
              : Math.max(1, Math.round(differenceInCalendarDays(parseISO(c.dataFim), parseISO(dataNoMes(inicio, c.diaVencimento))) / (c.recorrencia === 'semanal' ? 7 : 14)) + 1);
    const diaNaoCabe = c.diaVencimento > getDaysInMonth(parseISO(`${inicio}-01`));
    const destino = [ROTULO_DA_FORMA[c.formaPagamento], c.recorrencia !== 'mensal' ? ROTULO_DA_RECORRENCIA[c.recorrencia] : null, diaNaoCabe ? `dia ${c.diaVencimento}` : null]
      .filter(Boolean)
      .join(' · ');
    const onde = cartao ? cartao.nome : (nomeDaConta.get(c.contaBancariaId ?? -1) ?? '');
    fixas.push([
      formatarData(dataNoMes(inicio, c.diaVencimento)),
      onde,
      'Conta fixa',
      c.nome,
      categoria(c.categoriaId),
      valor(c.valor),
      destino,
      '',
      vezes !== null ? String(vezes) : '',
      membro(c.membroId),
      '',
      `app:contafixa:${c.id}`,
    ]);
  }

  for (const f of d.faturas) {
    if (f.status !== 'paga' || faturasComSaida.has(f.id) || !f.dataPagamento) continue;
    const cartao = cartaoPorId.get(f.cartaoId);
    if (!cartao) continue;
    add(f.dataPagamento, [cartao.nome, 'Fatura paga', '', '', valor(f.valorPago ?? 0), '', f.mesReferencia, '', '', '', `app:fatura:${f.id}`]);
  }
  // só quando tudo daquele mês do cartão estava pago (sem compra avulsa nem parcela em aberto)
  const temEmAberto = (cartaoId: number, mes: string) =>
    d.gastos.some((g) => g.formaPagamento === 'cartao' && g.cartaoId === cartaoId && mesDeCobrancaDoGasto(g, cartaoPorId) === mes) ||
    d.parcelas.some((p) => {
      if (p.status === 'paga') return false;
      const doCartao =
        (p.compraParceladaId !== null && compraPorId.get(p.compraParceladaId)?.cartaoId === cartaoId) ||
        (p.contaFixaId !== null && contaFixaPorId.get(p.contaFixaId)?.formaPagamento === 'cartao' && contaFixaPorId.get(p.contaFixaId)?.cartaoId === cartaoId);
      return doCartao && mesDeCobrancaDaParcela(p, contaFixaPorId, compraPorId, cartaoPorId) === mes;
    });
  for (const { cartao, mes, valor: pago, data } of pagasSemFatura.values()) {
    if (temEmAberto(cartao.id, mes)) continue;
    add(data, [cartao.nome, 'Fatura paga', 'Parcelas já pagas', '', valor(pago), '', mes, '', '', 'no app as parcelas estavam pagas sem a fatura registrada', '']);
  }
  lancamentos.sort((a, b) => a.data.localeCompare(b.data));
  return montarCsvDaPlanilha([...declaracoes, ...fixas, ...lancamentos.map((l) => l.linha)]);
}
