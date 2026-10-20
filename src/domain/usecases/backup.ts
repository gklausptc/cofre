import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

/**
 * Backup completo do Cofre em JSON. O formato guarda as tabelas como estão no SQLite
 * (nomes de tabela e coluna em snake_case, booleanos como 0/1), sem depender do schema
 * do código — assim o mesmo formato serve para o backup automático feito antes de uma
 * migration, quando o banco ainda está na versão anterior.
 */

export const FORMATO_BACKUP = 'cofre-backup';
export const VERSAO_FORMATO_BACKUP = 1;

/** Dias sem backup a partir dos quais o app passa a lembrar o usuário. */
export const DIAS_PARA_LEMBRAR_BACKUP = 7;

/** Quantas cópias automáticas ficam guardadas no aparelho (as mais antigas são apagadas). */
export const BACKUPS_AUTOMATICOS_MANTIDOS = 5;

export type ValorCelula = string | number | null;
export type LinhaBackup = Record<string, ValorCelula>;
export type TabelasBackup = Record<string, LinhaBackup[]>;

export type BackupCofre = {
  formato: typeof FORMATO_BACKUP;
  versaoFormato: typeof VERSAO_FORMATO_BACKUP;
  /** Índice da última migration aplicada no banco quando o backup foi feito (0000 = 0). */
  versaoSchema: number;
  /** ISO com data e hora. */
  criadoEm: string;
  tabelas: TabelasBackup;
};

export function montarBackup(tabelas: TabelasBackup, versaoSchema: number, agora: Date): BackupCofre {
  return {
    formato: FORMATO_BACKUP,
    versaoFormato: VERSAO_FORMATO_BACKUP,
    versaoSchema,
    criadoEm: agora.toISOString(),
    tabelas,
  };
}

export function nomeArquivoBackup(agora: Date): string {
  return `cofre-backup-${format(agora, 'yyyy-MM-dd')}.json`;
}

// ---------- validação de um arquivo escolhido pelo usuário ----------

/**
 * Conversores de backups antigos: a chave é a versão do schema que o conversor produz.
 * Só migrations que mudam o significado dos dados precisam de um (ex.: reais → centavos);
 * coluna nova não precisa, porque na restauração ela recebe o valor padrão.
 */
const CONVERSORES: Record<number, (tabelas: TabelasBackup) => TabelasBackup> = {
  6: converterReaisParaCentavos,
};

/** Colunas de dinheiro que a migration 0006 passou de reais para centavos inteiros. */
const COLUNAS_EM_CENTAVOS_DESDE_0006: Record<string, string[]> = {
  aportes_cofrinho: ['valor'],
  cartoes: ['limite'],
  cofrinhos: ['valor_meta'],
  compras_parceladas: ['valor_total'],
  contas_bancarias: ['saldo_inicial'],
  contas_fixas: ['valor'],
  faturas: ['valor_pago'],
  gastos_rapidos: ['valor', 'valor_original'],
  metas_financeiras: ['valor_meta', 'valor_atual'],
  movimentacoes: ['valor'],
  movimentacoes_reserva: ['valor'],
  parcelas: ['valor', 'valor_original'],
  reserva_emergencia: ['valor_meta', 'valor_atual'],
};

/** Backup feito antes da 0006 (dinheiro em reais): mesma conversão da migration, ROUND(valor * 100). */
function converterReaisParaCentavos(tabelas: TabelasBackup): TabelasBackup {
  const convertidas: TabelasBackup = { ...tabelas };
  for (const [tabela, colunas] of Object.entries(COLUNAS_EM_CENTAVOS_DESDE_0006)) {
    const linhas = tabelas[tabela];
    if (!linhas) continue;
    convertidas[tabela] = linhas.map((linha) => {
      const nova: LinhaBackup = { ...linha };
      for (const coluna of colunas) {
        const valor = linha[coluna];
        if (typeof valor === 'number') nova[coluna] = Math.round(valor * 100);
      }
      return nova;
    });
  }
  return convertidas;
}

export type ResultadoValidacaoBackup = { ok: true; backup: BackupCofre } | { ok: false; erro: string };

const ERRO_NAO_E_BACKUP = 'Esse arquivo não é um backup do Cofre.';

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function ehValorCelula(valor: unknown): valor is ValorCelula {
  return valor === null || typeof valor === 'string' || (typeof valor === 'number' && Number.isFinite(valor));
}

function lerTabelas(valor: unknown): TabelasBackup | null {
  if (!ehObjeto(valor)) return null;
  const tabelas: TabelasBackup = {};
  for (const [nome, linhas] of Object.entries(valor)) {
    if (!Array.isArray(linhas)) return null;
    const lidas: LinhaBackup[] = [];
    for (const linha of linhas) {
      if (!ehObjeto(linha)) return null;
      const lida: LinhaBackup = {};
      for (const [coluna, celula] of Object.entries(linha)) {
        if (!ehValorCelula(celula)) return null;
        lida[coluna] = celula;
      }
      lidas.push(lida);
    }
    tabelas[nome] = lidas;
  }
  return tabelas;
}

/**
 * Confere se o conteúdo (já convertido de JSON) é um backup válido e o traz para a
 * versão de schema atual do app. Recusa backups feitos numa versão mais nova do app.
 */
export function validarBackup(conteudo: unknown, versaoSchemaAtual: number): ResultadoValidacaoBackup {
  if (!ehObjeto(conteudo) || conteudo.formato !== FORMATO_BACKUP) {
    return { ok: false, erro: ERRO_NAO_E_BACKUP };
  }
  if (conteudo.versaoFormato !== VERSAO_FORMATO_BACKUP) {
    return { ok: false, erro: 'Esse backup usa um formato que esta versão do Cofre não conhece.' };
  }

  const { versaoSchema, criadoEm } = conteudo;
  if (typeof versaoSchema !== 'number' || !Number.isInteger(versaoSchema) || versaoSchema < 0) {
    return { ok: false, erro: ERRO_NAO_E_BACKUP };
  }
  if (typeof criadoEm !== 'string' || !isValid(parseISO(criadoEm))) {
    return { ok: false, erro: ERRO_NAO_E_BACKUP };
  }
  if (versaoSchema > versaoSchemaAtual) {
    return {
      ok: false,
      erro: 'Esse backup foi feito numa versão mais nova do Cofre. Atualize o app antes de restaurar.',
    };
  }

  let tabelas = lerTabelas(conteudo.tabelas);
  if (tabelas === null || !('categorias' in tabelas)) {
    return { ok: false, erro: ERRO_NAO_E_BACKUP };
  }

  for (let versao = versaoSchema + 1; versao <= versaoSchemaAtual; versao++) {
    const converter = CONVERSORES[versao];
    if (converter) tabelas = converter(tabelas);
  }

  return {
    ok: true,
    backup: {
      formato: FORMATO_BACKUP,
      versaoFormato: VERSAO_FORMATO_BACKUP,
      versaoSchema: versaoSchemaAtual,
      criadoEm,
      tabelas,
    },
  };
}

// ---------- prévia ("142 lançamentos, 3 contas, 2 cartões…") ----------

export type ItemResumoBackup = { rotulo: string; quantidade: number };

const GRUPOS_RESUMO: { tabelas: string[]; singular: string; plural: string }[] = [
  { tabelas: ['movimentacoes', 'gastos_rapidos'], singular: 'lançamento', plural: 'lançamentos' },
  { tabelas: ['contas_bancarias'], singular: 'conta bancária', plural: 'contas bancárias' },
  { tabelas: ['cartoes'], singular: 'cartão', plural: 'cartões' },
  { tabelas: ['compras_parceladas'], singular: 'compra parcelada', plural: 'compras parceladas' },
  { tabelas: ['contas_fixas'], singular: 'conta fixa', plural: 'contas fixas' },
  { tabelas: ['cofrinhos'], singular: 'cofrinho', plural: 'cofrinhos' },
  { tabelas: ['movimentacoes_reserva'], singular: 'movimento da reserva', plural: 'movimentos da reserva' },
  { tabelas: ['membros_familia'], singular: 'membro da família', plural: 'membros da família' },
];

/** Linhas desativadas (`ativo = 0`, o "remover" do app) não entram na contagem. */
function contarAtivas(linhas: LinhaBackup[] | undefined): number {
  return (linhas ?? []).filter((linha) => linha.ativo !== 0).length;
}

export function resumirBackup(backup: Pick<BackupCofre, 'tabelas'>): ItemResumoBackup[] {
  return GRUPOS_RESUMO.map((grupo) => {
    const quantidade = grupo.tabelas.reduce((soma, tabela) => soma + contarAtivas(backup.tabelas[tabela]), 0);
    return { rotulo: quantidade === 1 ? grupo.singular : grupo.plural, quantidade };
  }).filter((item) => item.quantidade > 0);
}

export function textoResumoBackup(itens: ItemResumoBackup[]): string {
  if (itens.length === 0) return 'Nenhum lançamento, conta ou cartão cadastrado.';
  return itens.map((item) => `${item.quantidade} ${item.rotulo}`).join(' · ');
}

// ---------- restauração ----------

/**
 * Campos de `preferencias` que pertencem ao aparelho, não aos dados: o PIN fica no
 * Keychain (fora do backup), então restaurar `bloqueio_ativo = 1` sem o PIN trancaria
 * o app sem senha conhecida. A data do último backup também é do aparelho.
 */
const CAMPOS_DO_APARELHO = ['bloqueio_ativo', 'biometria_ativa', 'ultimo_backup_em'];

/** Tabelas a gravar na restauração, mantendo as preferências do aparelho atual. */
export function prepararTabelasParaRestaurar(
  backup: Pick<BackupCofre, 'tabelas'>,
  preferenciasAtuais: LinhaBackup | null
): TabelasBackup {
  const tabelas: TabelasBackup = { ...backup.tabelas };
  if (preferenciasAtuais === null) return tabelas;

  const doBackup = tabelas.preferencias?.find((linha) => linha.id === 1);
  if (!doBackup) {
    tabelas.preferencias = [preferenciasAtuais];
    return tabelas;
  }

  const mesclada: LinhaBackup = { ...doBackup };
  for (const campo of CAMPOS_DO_APARELHO) {
    if (campo in preferenciasAtuais) mesclada[campo] = preferenciasAtuais[campo];
  }
  tabelas.preferencias = [mesclada, ...tabelas.preferencias.filter((linha) => linha.id !== 1)];
  return tabelas;
}

// ---------- cópias automáticas guardadas no aparelho ----------

export type MotivoBackupAutomatico = 'antes-da-atualizacao' | 'antes-de-restaurar';

const PREFIXO_AUTOMATICO = 'cofre-auto-';
const PADRAO_AUTOMATICO = /^cofre-auto-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})-(antes-da-atualizacao|antes-de-restaurar)\.json$/;

export function nomeBackupAutomatico(agora: Date, motivo: MotivoBackupAutomatico): string {
  return `${PREFIXO_AUTOMATICO}${format(agora, 'yyyy-MM-dd-HHmmss')}-${motivo}.json`;
}

export type InfoBackupAutomatico = { nome: string; criadoEm: Date; motivo: MotivoBackupAutomatico };

export function interpretarNomeBackupAutomatico(nome: string): InfoBackupAutomatico | null {
  const partes = nome.match(PADRAO_AUTOMATICO);
  if (!partes) return null;
  const [, ano, mes, dia, hora, minuto, segundo, motivo] = partes;
  const criadoEm = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo));
  if (!isValid(criadoEm)) return null;
  return { nome, criadoEm, motivo: motivo as MotivoBackupAutomatico };
}

/** Cópias automáticas da mais nova para a mais antiga (arquivos com outro nome são ignorados). */
export function ordenarBackupsAutomaticos(nomes: string[]): InfoBackupAutomatico[] {
  return nomes
    .map(interpretarNomeBackupAutomatico)
    .filter((info): info is InfoBackupAutomatico => info !== null)
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
}

/** Nomes das cópias automáticas que passaram do limite e devem ser apagadas. */
export function backupsAutomaticosParaApagar(nomes: string[], manter = BACKUPS_AUTOMATICOS_MANTIDOS): string[] {
  return ordenarBackupsAutomaticos(nomes)
    .slice(manter)
    .map((info) => info.nome);
}

// ---------- "último backup: há 3 dias" ----------

export type IdadeBackup = { texto: string; precisaLembrar: boolean };

export function descreverIdadeBackup(ultimoBackupEm: string | null, agora: Date): IdadeBackup {
  if (ultimoBackupEm === null || !isValid(parseISO(ultimoBackupEm))) {
    return { texto: 'Você ainda não fez nenhum backup.', precisaLembrar: true };
  }
  const dias = differenceInCalendarDays(agora, parseISO(ultimoBackupEm));
  const texto = dias <= 0 ? 'Último backup: hoje.' : dias === 1 ? 'Último backup: ontem.' : `Último backup: há ${dias} dias.`;
  return { texto, precisaLembrar: dias > DIAS_PARA_LEMBRAR_BACKUP };
}
