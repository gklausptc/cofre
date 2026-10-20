import { bancoPorTexto } from './bancos';
import { deduplicar, type LancamentoExistente, type SituacaoDuplicidade } from './deduplicar';
import { ehPagamentoOuEstorno, prepararImportacaoExtrato, type DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import type { RegistroDeImportacao } from '@/domain/repositories/importacoesRepository';
import type { Cartao, ContaBancaria, GastoRapido, Movimentacao } from '@/domain/types/entities';
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
  /** Vem marcado na prévia? Novas sim; dúvidas e duplicatas não (o usuário decide). */
  incluirPorPadrao: boolean;
  /** Pode ser marcado? Já importadas e pagamentos/estornos não. */
  podeIncluir: boolean;
};

export type ResumoDaAnalise = {
  total: number;
  novas: number;
  jaImportadas: number;
  duplicatas: number;
  duvidas: number;
  pagamentosOuEstornos: number;
};

/** Junta leitura e deduplicação: o que fazer com cada linha e os números do resumo. */
export function analisarImportacao(
  extrato: ExtratoLido,
  destino: DestinoImportacao,
  existentes: LancamentoExistente[]
): { itens: ItemDaAnalise[]; resumo: ResumoDaAnalise } {
  const situacoes = deduplicar(extrato.transacoes, existentes);
  const itens = extrato.transacoes.map((transacao, i): ItemDaAnalise => {
    const situacao = situacoes[i];
    const pagamentoOuEstorno = ehPagamentoOuEstorno(transacao, destino);
    const podeIncluir = !pagamentoOuEstorno && situacao.tipo !== 'ja_importada';
    return { transacao, situacao, pagamentoOuEstorno, podeIncluir, incluirPorPadrao: podeIncluir && situacao.tipo === 'nova' };
  });
  const contar = (filtro: (item: ItemDaAnalise) => boolean) => itens.filter(filtro).length;
  return {
    itens,
    resumo: {
      total: itens.length,
      novas: contar((i) => i.situacao.tipo === 'nova' && !i.pagamentoOuEstorno),
      jaImportadas: contar((i) => i.situacao.tipo === 'ja_importada'),
      duplicatas: contar((i) => i.situacao.tipo === 'duplicata'),
      duvidas: contar((i) => i.situacao.tipo === 'duvida'),
      pagamentosOuEstornos: contar((i) => i.pagamentoOuEstorno && i.situacao.tipo !== 'ja_importada'),
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

/** O que gravar: a importação (com os números) e as linhas escolhidas, já com o id externo. */
export function montarRegistroDeImportacao(params: {
  arquivo: string;
  extrato: ExtratoLido;
  destino: DestinoImportacao;
  selecionadas: TransacaoLida[];
  agora: Date;
}): RegistroDeImportacao {
  const { arquivo, extrato, destino, selecionadas, agora } = params;
  const preparada = prepararImportacaoExtrato(selecionadas, destino);
  const totalLinhas = extrato.transacoes.length + extrato.ignoradas;
  return {
    importacao: {
      arquivo,
      formato: extrato.formato,
      banco: extrato.banco,
      contaBancariaId: destino.tipo === 'conta' ? destino.contaBancariaId : null,
      cartaoId: destino.tipo === 'cartao' ? destino.cartaoId : null,
      periodoInicio: extrato.periodo?.inicio ?? null,
      periodoFim: extrato.periodo?.fim ?? null,
      totalLinhas,
      importadas: selecionadas.length,
      ignoradas: totalLinhas - selecionadas.length,
      pendentes: 0,
      criadaEm: agora.toISOString(),
    },
    movimentacoes: preparada.movimentacoes,
    gastos: preparada.gastos,
  };
}
