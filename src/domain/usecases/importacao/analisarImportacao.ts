import { bancoPorTexto } from './bancos';
import { normalizarDescricao, semAcentos } from './normalizarDescricao';
import { dataFechamentoDaFatura, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import { formatarData } from '@/core/utils/date';
import { deduplicar, type LancamentoExistente, type SituacaoDuplicidade } from './deduplicar';
import { CONFIANCA_MINIMA, type AcaoEspecial, type Categorizacao, type LinhaParaCategorizar } from './categorizar';
import { conciliarExtrato, type Conciliacao, type DadosParaConciliar } from './conciliar';
import { ehPagamentoOuEstorno, type DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import type { DadosRegraCategorizacao, RegistroDeImportacao } from '@/domain/repositories/importacoesRepository';
import type { DadosMovimentacao } from '@/domain/repositories/movimentacoesRepository';
import type { DadosGastoRapido } from '@/domain/repositories/gastosRapidosRepository';
import type { Cartao, Categoria, ContaBancaria, GastoRapido, Movimentacao } from '@/domain/types/entities';
import type { ExtratoLido, OrigemExtrato, TransacaoLida } from './tipos';

/** O que já está no app naquela conta ou cartão, na convenção de sinal do extrato. */
export function existentesDoDestino(
  destino: DestinoImportacao,
  movimentacoes: Movimentacao[],
  gastos: GastoRapido[]
): LancamentoExistente[] {
  if (destino.tipo === 'cartao') {
    return gastos
      .filter((g) => g.formaPagamento === 'cartao' && g.cartaoId === destino.cartaoId)
      .map((g) => ({ id: `gasto-${g.id}`, data: g.data, valor: g.valor, descricao: g.descricao ?? '', idExterno: g.idExterno }));
  }
  const contaId = destino.contaBancariaId;
  const daConta = movimentacoes
    .filter((m) => m.contaBancariaId === contaId || (m.tipo === 'transferencia' && m.contaDestinoId === contaId))
    .map((m) => ({
      id: `mov-${m.id}`,
      data: m.data,
      valor: m.tipo === 'entrada' || (m.tipo === 'transferencia' && m.contaDestinoId === contaId) ? m.valor : -m.valor,
      descricao: m.descricao ?? '',
      idExterno: m.idExterno,
    }));
  const debitosDaConta = gastos
    .filter((g) => g.contaBancariaId === contaId && (g.formaPagamento === 'debito' || g.formaPagamento === 'pix'))
    .map((g) => ({ id: `gasto-${g.id}`, data: g.data, valor: -g.valor, descricao: g.descricao ?? '', idExterno: g.idExterno }));
  return [...daConta, ...debitosDaConta];
}

export type ItemDaAnalise = {
  transacao: TransacaoLida;
  situacao: SituacaoDuplicidade;
  /** Na fatura, valor negativo é pagamento ou estorno: não vira gasto. */
  pagamentoOuEstorno: boolean;
  /** Vem marcado na prévia? Novas sim; dúvidas, duplicatas e o que o app já tem não. */
  incluirPorPadrao: boolean;
  /** Pode ser marcado? Já importadas e pagamentos/estornos não. */
  podeIncluir: boolean;
  /** De onde veio a categoria sugerida (null se a análise foi feita sem o categorizador). */
  categorizacao: Categorizacao | null;
  /** O que a linha é além de um lançamento comum: conta fixa, fatura, transferência… */
  conciliacao: Conciliacao | null;
  /** Categoria que vai ser gravada se você não mexer (null = sem categoria). */
  categoriaSugerida: number | null;
  /** Falta uma resposta sua: categoria incerta, ou pode ser um lançamento que você já fez. */
  precisaDeVoce: boolean;
};

export type ResumoDaAnalise = {
  total: number;
  novas: number;
  jaImportadas: number;
  duplicatas: number;
  duvidas: number;
  pagamentosOuEstornos: number;
  /** Novas que já saem com categoria (confiança de 0,7 para cima) ou reconhecidas. */
  categorizadosSozinhos: number;
  contasFixas: number;
  pagamentosDeFatura: number;
  transferencias: number;
  /** Pagamentos e parcelas que o app já tinha (não entram de novo). */
  jaNoApp: number;
  precisamDeVoce: number;
};

/** O que a análise precisa, além do extrato, para categorizar e conciliar. */
export type InteligenciaDaImportacao = {
  categorizar: (linha: LinhaParaCategorizar) => Categorizacao;
  dados: DadosParaConciliar;
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[];
  /** Fatura escolhida na importação de cartão ('YYYY-MM'). */
  mesDaFatura?: string | null;
};

/** Conta: saída é despesa. Fatura: compra (positiva) é despesa. */
export function naturezaDaLinha(transacao: Pick<TransacaoLida, 'valor'>, destino: DestinoImportacao): 'despesa' | 'receita' {
  if (destino.tipo === 'cartao') return transacao.valor > 0 ? 'despesa' : 'receita';
  return transacao.valor < 0 ? 'despesa' : 'receita';
}

/** Conciliações em que a categoria não é perguntada (não são despesa nem receita, ou já vêm com ela). */
const SEM_PERGUNTA_DE_CATEGORIA: Conciliacao['tipo'][] = [
  'conta_fixa',
  'fatura',
  'transferencia_propria',
  'receita_prevista',
  'salario',
  'ja_paga',
  'ja_na_fatura',
];

/** Categoria que a conciliação define (undefined = a conciliação não decide a categoria). */
function categoriaDaConciliacao(
  conciliacao: Conciliacao | null,
  categorias: Pick<Categoria, 'id' | 'nome' | 'tipo'>[]
): number | null | undefined {
  if (!conciliacao) return undefined;
  if (conciliacao.tipo === 'conta_fixa') return conciliacao.categoriaId;
  if (conciliacao.tipo === 'salario') {
    return categorias.find((c) => c.tipo === 'receita' && semAcentos(c.nome) === 'SALARIO')?.id ?? null;
  }
  if (conciliacao.tipo === 'ja_paga' || conciliacao.tipo === 'ja_na_fatura') return undefined;
  return null;
}

/**
 * Junta leitura, deduplicação, categorização e conciliação: o que fazer com cada linha e
 * os números do resumo ("38 categorizados sozinhos · 2 contas fixas · 1 pagamento de fatura").
 * Sem `inteligencia`, só deduplica (como na 2a).
 */
export function analisarImportacao(
  extrato: ExtratoLido,
  destino: DestinoImportacao,
  existentes: LancamentoExistente[],
  inteligencia: InteligenciaDaImportacao | null = null
): { itens: ItemDaAnalise[]; resumo: ResumoDaAnalise } {
  const situacoes = deduplicar(extrato.transacoes, existentes);
  const candidatas = extrato.transacoes.map(
    (t, i) => !ehPagamentoOuEstorno(t, destino) && situacoes[i].tipo !== 'ja_importada' && situacoes[i].tipo !== 'duplicata'
  );

  const categorizacoes = extrato.transacoes.map((t, i) =>
    inteligencia && candidatas[i]
      ? inteligencia.categorizar({
          descricao: t.descricao,
          natureza: naturezaDaLinha(t, destino),
          categoriaDoBanco: t.categoriaDoBanco,
        })
      : null
  );

  // só as candidatas disputam contas fixas, faturas e contrapartes
  const conciliacoes: (Conciliacao | null)[] = extrato.transacoes.map(() => null);
  if (inteligencia) {
    const indices = extrato.transacoes.map((_, i) => i).filter((i) => candidatas[i]);
    const resultado = conciliarExtrato(
      indices.map((i) => extrato.transacoes[i]),
      indices.map((i) => categorizacoes[i]),
      destino,
      inteligencia.dados,
      inteligencia.mesDaFatura ?? null
    );
    indices.forEach((i, posicao) => {
      conciliacoes[i] = resultado[posicao];
    });
  }

  const itens = extrato.transacoes.map((transacao, i): ItemDaAnalise => {
    const situacao = situacoes[i];
    const categorizacao = categorizacoes[i];
    const conciliacao = conciliacoes[i];
    const pagamentoOuEstorno = ehPagamentoOuEstorno(transacao, destino);
    const podeIncluir = !pagamentoOuEstorno && situacao.tipo !== 'ja_importada';
    const jaNoApp = conciliacao?.tipo === 'ja_paga' || conciliacao?.tipo === 'ja_na_fatura';
    const ignorar = categorizacao?.acao === 'ignorar';
    const incluirPorPadrao = podeIncluir && situacao.tipo === 'nova' && !jaNoApp && !ignorar;

    const daConciliacao = inteligencia ? categoriaDaConciliacao(conciliacao, inteligencia.categorias) : undefined;
    const categoriaSugerida =
      daConciliacao !== undefined
        ? daConciliacao
        : categorizacao && categorizacao.confianca >= CONFIANCA_MINIMA
          ? categorizacao.categoriaId
          : null;
    const resolvida =
      (conciliacao !== null && SEM_PERGUNTA_DE_CATEGORIA.includes(conciliacao.tipo)) ||
      categorizacao === null ||
      ignorar ||
      categorizacao.acao === 'transferencia_propria' ||
      categorizacao.acao === 'emprestimo' ||
      categorizacao.confianca >= CONFIANCA_MINIMA;
    const precisaDeVoce = podeIncluir && !jaNoApp && !ignorar && (situacao.tipo === 'duvida' || (incluirPorPadrao && !resolvida));

    return {
      transacao,
      situacao,
      pagamentoOuEstorno,
      podeIncluir,
      incluirPorPadrao,
      categorizacao,
      conciliacao,
      categoriaSugerida,
      precisaDeVoce,
    };
  });

  const contar = (filtro: (item: ItemDaAnalise) => boolean) => itens.filter(filtro).length;
  const conciliadaComo = (item: ItemDaAnalise, tipo: Conciliacao['tipo']) => item.incluirPorPadrao && item.conciliacao?.tipo === tipo;
  return {
    itens,
    resumo: {
      total: itens.length,
      novas: contar((i) => i.situacao.tipo === 'nova' && !i.pagamentoOuEstorno),
      jaImportadas: contar((i) => i.situacao.tipo === 'ja_importada'),
      duplicatas: contar((i) => i.situacao.tipo === 'duplicata'),
      duvidas: contar((i) => i.situacao.tipo === 'duvida'),
      pagamentosOuEstornos: contar((i) => i.pagamentoOuEstorno && i.situacao.tipo !== 'ja_importada'),
      categorizadosSozinhos: contar(
        (i) => i.incluirPorPadrao && !i.precisaDeVoce && (i.categoriaSugerida !== null || i.conciliacao !== null)
      ),
      contasFixas: contar((i) => conciliadaComo(i, 'conta_fixa')),
      pagamentosDeFatura: contar((i) => conciliadaComo(i, 'fatura')),
      transferencias: contar((i) => conciliadaComo(i, 'transferencia_propria')),
      jaNoApp: contar((i) => i.conciliacao?.tipo === 'ja_paga' || i.conciliacao?.tipo === 'ja_na_fatura'),
      precisamDeVoce: contar((i) => i.precisaDeVoce),
    },
  };
}

export type DestinoSugerido = { tipo: OrigemExtrato; id: number | null };

/**
 * Conta ou cartão mais provável para o arquivo: o tipo vem do arquivo (fatura → cartão) e o
 * item, do banco reconhecido. Só sugere quando há exatamente um do mesmo banco (ou um só no total).
 */
export function sugerirDestino(
  extrato: Pick<ExtratoLido, 'banco' | 'origem'>,
  contas: Pick<ContaBancaria, 'id' | 'banco' | 'nomeConta'>[],
  cartoes: Pick<Cartao, 'id' | 'nome'>[]
): DestinoSugerido {
  const tipo = extrato.origem ?? 'conta';
  const candidatos =
    tipo === 'conta'
      ? contas.map((c) => ({ id: c.id, banco: bancoPorTexto(`${c.banco} ${c.nomeConta}`) }))
      : cartoes.map((c) => ({ id: c.id, banco: bancoPorTexto(c.nome) }));
  const doBanco = extrato.banco ? candidatos.filter((c) => c.banco === extrato.banco) : [];
  if (doBanco.length === 1) return { tipo, id: doBanco[0].id };
  if (candidatos.length === 1) return { tipo, id: candidatos[0].id };
  return { tipo, id: null };
}

export type DiasDoCartao = Pick<Cartao, 'id' | 'diaFechamento' | 'diaVencimento'>;

const parcelaDe = (t: TransacaoLida) => t.parcela ?? normalizarDescricao(t.descricao).parcela;

/**
 * Mês ('YYYY-MM') de vencimento da fatura que o arquivo traz: o que o arquivo diz (nome ou
 * cabeçalho) ou, senão, o mês em que cai a maioria das compras à vista e primeiras parcelas
 * (as demais parcelas vêm com a data da compra original, de meses atrás).
 */
export function sugerirMesDaFatura(extrato: Pick<ExtratoLido, 'transacoes' | 'vencimentoFatura'>, cartao: DiasDoCartao): string | null {
  if (extrato.vencimentoFatura) return extrato.vencimentoFatura.slice(0, 7);
  const cartoes = new Map([[cartao.id, cartao]]);
  const contagem = new Map<string, number>();
  for (const t of extrato.transacoes) {
    const parcela = parcelaDe(t);
    if (t.valor <= 0 || (parcela && parcela.numero > 1)) continue;
    const mes = mesDeCobrancaDoGasto({ data: t.data, formaPagamento: 'cartao', cartaoId: cartao.id }, cartoes);
    contagem.set(mes, (contagem.get(mes) ?? 0) + 1);
  }
  let melhor: string | null = null;
  for (const [mes, vezes] of contagem) {
    const atual = melhor ? (contagem.get(melhor) ?? 0) : -1;
    if (vezes > atual || (vezes === atual && melhor !== null && mes > melhor)) melhor = mes;
  }
  return melhor;
}

/**
 * Data com que a compra entra no app para cair na fatura escolhida. Parcelas e compras antigas
 * (o C6 e o Itaú mandam a data da compra original) ficam na data de fechamento dessa fatura.
 */
export function dataNaFatura(dataCompra: string, mesDaFatura: string, cartao: DiasDoCartao): { data: string; ajustada: boolean } {
  const cartoes = new Map([[cartao.id, cartao]]);
  const mes = mesDeCobrancaDoGasto({ data: dataCompra, formaPagamento: 'cartao', cartaoId: cartao.id }, cartoes);
  if (mes === mesDaFatura) return { data: dataCompra, ajustada: false };
  return { data: dataFechamentoDaFatura(mesDaFatura, cartao), ajustada: true };
}

/** Uma linha que vai ser gravada, com o que foi decidido para ela na prévia. */
export type LinhaEscolhida = {
  transacao: TransacaoLida;
  categoriaId: number | null;
  membroId?: number | null;
  conciliacao?: Conciliacao | null;
  acao?: AcaoEspecial | null;
  regraId?: number | null;
};

/** A linha a partir de um item da análise, com a categoria sugerida (ou a escolhida). */
export function linhaDoItem(item: ItemDaAnalise, categoriaId: number | null = item.categoriaSugerida): LinhaEscolhida {
  return {
    transacao: item.transacao,
    categoriaId,
    membroId: item.categorizacao?.membroId ?? (item.conciliacao?.tipo === 'conta_fixa' ? item.conciliacao.membroId : null),
    conciliacao: item.conciliacao,
    acao: item.categorizacao?.acao ?? null,
    regraId: item.categorizacao?.regraId ?? null,
  };
}

function movimentacaoDaLinha(contaBancariaId: number, t: TransacaoLida, extra: Partial<DadosMovimentacao> = {}): DadosMovimentacao {
  return {
    contaBancariaId,
    tipo: t.valor < 0 ? 'saida' : 'entrada',
    valor: Math.abs(t.valor),
    data: t.data,
    descricao: t.descricao,
    categoriaId: null,
    contaDestinoId: null,
    origem: 'manual',
    membroId: null,
    reservarProximoMes: false,
    recorrente: false,
    recorrenteOrigemId: null,
    faturaId: null,
    parcelaId: null,
    idExterno: t.idExterno,
    ...extra,
  };
}

/**
 * O que gravar: a importação (com os números), as linhas escolhidas (com categoria e id
 * externo) e o que a conciliação manda fazer — dar baixa em conta fixa e fatura, transformar
 * o outro lado de uma transferência, confirmar a receita prevista — mais as regras novas.
 */
export function montarRegistroDeImportacao(params: {
  arquivo: string;
  extrato: ExtratoLido;
  destino: DestinoImportacao;
  linhas: LinhaEscolhida[];
  agora: Date;
  /** Fatura de cartão: tudo entra na fatura que vence neste mês. */
  fatura?: { mes: string; cartao: DiasDoCartao } | null;
  /** Regras criadas na prévia ("sempre categorizar assim"). */
  regrasNovas?: DadosRegraCategorizacao[];
}): RegistroDeImportacao {
  const { arquivo, extrato, destino, agora, fatura } = params;
  const linhas = params.linhas.filter((l) => !ehPagamentoOuEstorno(l.transacao, destino));
  const totalLinhas = extrato.transacoes.length + extrato.ignoradas;
  const registro: RegistroDeImportacao = {
    importacao: {
      arquivo,
      formato: extrato.formato,
      banco: extrato.banco,
      contaBancariaId: destino.tipo === 'conta' ? destino.contaBancariaId : null,
      cartaoId: destino.tipo === 'cartao' ? destino.cartaoId : null,
      periodoInicio: extrato.periodo?.inicio ?? null,
      periodoFim: extrato.periodo?.fim ?? null,
      totalLinhas,
      importadas: linhas.length,
      ignoradas: totalLinhas - linhas.length,
      pendentes: 0,
      criadaEm: agora.toISOString(),
    },
    movimentacoes: [],
    gastos: [],
    pagamentosDeContaFixa: [],
    pagamentosDeFatura: [],
    alteracoes: [],
    regrasNovas: params.regrasNovas ?? [],
    regrasUsadas: [...new Set(linhas.map((l) => l.regraId).filter((id): id is number => id != null))],
  };

  if (destino.tipo === 'cartao') {
    for (const linha of linhas) {
      const t = linha.transacao;
      let { data, descricao } = t;
      if (fatura) {
        const naFatura = dataNaFatura(t.data, fatura.mes, fatura.cartao);
        if (naFatura.ajustada) {
          data = naFatura.data;
          descricao = `${t.descricao} (compra em ${formatarData(t.data)})`;
        }
      }
      const gasto: DadosGastoRapido = {
        valor: Math.abs(t.valor),
        categoriaId: linha.categoriaId,
        descricao,
        data,
        formaPagamento: 'cartao',
        contaBancariaId: null,
        cartaoId: destino.cartaoId,
        membroId: linha.membroId ?? null,
        idExterno: t.idExterno,
      };
      registro.gastos.push(gasto);
    }
    registro.importacao.pendentes = registro.gastos.filter((g) => g.categoriaId === null).length;
    return registro;
  }

  const contaId = destino.contaBancariaId;
  for (const linha of linhas) {
    const t = linha.transacao;
    const c = linha.conciliacao ?? null;
    const comum = { categoriaId: linha.categoriaId, membroId: linha.membroId ?? null };

    if (c?.tipo === 'conta_fixa' && t.valor < 0) {
      registro.movimentacoes.push(
        movimentacaoDaLinha(contaId, t, {
          ...comum,
          categoriaId: linha.categoriaId ?? c.categoriaId,
          origem: 'conta_fixa',
          parcelaId: c.parcelaId,
        })
      );
      registro.pagamentosDeContaFixa.push({ parcelaId: c.parcelaId, dataPagamento: t.data, valor: Math.abs(t.valor) });
    } else if (c?.tipo === 'fatura' && t.valor < 0) {
      const saida = movimentacaoDaLinha(contaId, t, { origem: 'fatura' });
      if (c.fatura) {
        registro.pagamentosDeFatura.push({
          pagamento: {
            cartaoId: c.fatura.cartaoId,
            mesReferencia: c.fatura.mesReferencia,
            dataFechamento: c.fatura.dataFechamento,
            dataVencimento: c.fatura.dataVencimento,
            contaBancariaId: contaId,
            valorPago: Math.abs(t.valor),
            dataPagamento: t.data,
          },
          parcelaIds: c.fatura.parcelaIds,
          saida,
        });
      } else {
        registro.movimentacoes.push(saida);
      }
    } else if (c?.tipo === 'transferencia_propria' && c.contraparteId !== null && c.outraContaId !== null) {
      // o outro lado já está no app: ele vira a transferência, e esta linha não entra
      registro.alteracoes.push({
        movimentacaoId: c.contraparteId,
        motivo: 'transferencia',
        mudancas:
          t.valor < 0
            ? { tipo: 'transferencia', contaBancariaId: contaId, contaDestinoId: c.outraContaId, categoriaId: null }
            : { tipo: 'transferencia', contaBancariaId: c.outraContaId, contaDestinoId: contaId, categoriaId: null },
      });
    } else if (
      t.valor < 0 &&
      (c?.tipo === 'transferencia_propria' || linha.acao === 'transferencia_propria' || linha.acao === 'emprestimo')
    ) {
      registro.movimentacoes.push(
        movimentacaoDaLinha(contaId, t, {
          tipo: 'transferencia',
          contaDestinoId: c?.tipo === 'transferencia_propria' ? c.outraContaId : null,
          membroId: linha.membroId ?? null,
          descricao: linha.acao === 'emprestimo' ? `Empréstimo: ${t.descricao}` : t.descricao,
        })
      );
    } else if (c?.tipo === 'receita_prevista' && t.valor > 0) {
      registro.alteracoes.push({
        movimentacaoId: c.movimentacaoId,
        motivo: 'receita_prevista',
        mudancas: { valor: t.valor, data: t.data, idExterno: t.idExterno },
      });
    } else {
      registro.movimentacoes.push(movimentacaoDaLinha(contaId, t, comum));
    }
  }
  registro.importacao.pendentes = registro.movimentacoes.filter(
    (m) => m.categoriaId === null && m.tipo !== 'transferencia' && m.origem === 'manual'
  ).length;
  return registro;
}
