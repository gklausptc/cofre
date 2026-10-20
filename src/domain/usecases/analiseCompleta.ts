import { calcularGastosFixosDoMes, type ResumoGastosFixos } from './calcularGastosFixosDoMes';
import { calcularLivreParaGastar, type LivreParaGastar } from './calcularLivreParaGastar';
import { calcularSaldoConta } from './calcularSaldoConta';
import { obterLancamentosDoPeriodo, type DadosFinanceiros } from './obterLancamentosDoPeriodo';
import { numerosDoMes, type NumerosDoMes } from './automacoes/fechamentoDoMes';
import type { LancamentoDoPeriodo, NaturezaLancamento, StatusLancamento, TipoLancamento } from '@/domain/types/lancamento';
import type { Categoria, ContaBancaria, MembroFamilia } from '@/domain/types/entities';

/**
 * Tudo o que foi lançado e como o app fez as contas, num arquivo só: para o dono mandar e
 * alguém conferir por que um número saiu estranho (Livre para gastar negativo, compromissos,
 * relatório do ano). Junto vai o backup (os dados como estão gravados); aqui fica a visão
 * calculada — cada lançamento com natureza e sinal, os números de cada mês e o saldo das contas.
 */

/** Como o lançamento mexe no dinheiro: entra, sai, só passa entre contas do app, ou não mexe (fatura, que já soma as compras). */
export type SentidoDoLancamento = 'entra' | 'sai' | 'entre_contas' | 'so_soma';

export type LinhaDaAnalise = {
  id: string;
  data: string;
  competencia: string;
  tipo: TipoLancamento;
  natureza: NaturezaLancamento;
  sentido: SentidoDoLancamento;
  status: StatusLancamento;
  /** Centavos, sempre positivo (o sentido diz se entra ou sai). */
  valor: number;
  descricao: string;
  origem: string;
  conta: string | null;
  contaDestino: string | null;
  cartao: string | null;
  categoria: string | null;
  membro: string | null;
  noCartao: boolean;
  importacaoId: number | null;
};

export type MesDaAnalise = {
  mes: string;
  /** Pelo que já aconteceu (é o que o relatório do ano usa). */
  realizado: NumerosDoMes;
  /** Com o que ainda está previsto no mês. */
  comPrevistos: NumerosDoMes;
  transferencias: { entraram: number; sairam: number; entreContas: number };
  faturas: number;
  pagamentosDeCompromisso: number;
  livreParaGastar: LivreParaGastar;
  compromissos: Pick<ResumoGastosFixos, 'total' | 'totalPago' | 'totalPendente' | 'porTipo'> & {
    itens: { nome: string; tipo: string; valor: number; paga: boolean }[];
  };
};

export type AnaliseCompleta = {
  geradoEm: string;
  hoje: string;
  contas: { id: number; nome: string; banco: string; identificador: string | null; ativa: boolean; saldoInicial: number; saldoHoje: number; saldoComFuturos: number }[];
  cartoes: { id: number; nome: string; limite: number; diaFechamento: number; diaVencimento: number; ativo: boolean }[];
  contasFixas: { id: number; nome: string; valor: number; ativa: boolean; formaPagamento: string; recorrencia: string; ocorrencias: number }[];
  meses: MesDaAnalise[];
  lancamentos: LinhaDaAnalise[];
};

export type ParametrosDaAnalise = {
  dados: DadosFinanceiros;
  contas: ContaBancaria[];
  categorias: Pick<Categoria, 'id' | 'nome'>[];
  membros: Pick<MembroFamilia, 'id' | 'nome'>[];
  hoje: string;
  geradoEm: string;
};

const SINAL_DA_NATUREZA: Record<NaturezaLancamento, SentidoDoLancamento> = {
  receita: 'entra',
  resgate: 'entra',
  despesa: 'sai',
  pagamento: 'sai',
  guardado: 'sai',
  fatura: 'so_soma',
  transferencia: 'entre_contas',
};

export function montarAnaliseCompleta(p: ParametrosDaAnalise): AnaliseCompleta {
  const { dados, hoje } = p;
  const movimentacoes = dados.movimentacoes ?? [];
  const gastos = dados.gastos ?? [];
  const parcelas = dados.parcelas ?? [];
  const contasFixas = dados.contasFixas ?? [];
  const cartoes = dados.cartoes ?? [];

  const nomeDaConta = new Map(p.contas.map((c) => [c.id, c.nomeConta]));
  const nomeDoCartao = new Map(cartoes.map((c) => [c.id, c.nome]));
  const nomeDaCategoria = new Map(p.categorias.map((c) => [c.id, c.nome]));
  const nomeDoMembro = new Map(p.membros.map((m) => [m.id, m.nome]));
  const movPorId = new Map(movimentacoes.map((m) => [`mov-${m.id}`, m]));
  const gastoPorId = new Map(gastos.map((g) => [`gasto-${g.id}`, g]));

  const todos = obterLancamentosDoPeriodo('0000-01-01', '9999-12-31', dados, hoje);

  const sentidoDe = (l: LancamentoDoPeriodo): SentidoDoLancamento => {
    if (l.natureza !== 'transferencia') return SINAL_DA_NATUREZA[l.natureza];
    const mov = movPorId.get(l.id);
    if (mov?.tipo === 'entrada') return 'entra';
    if (mov?.tipo === 'saida') return 'sai';
    return 'entre_contas';
  };

  const lancamentos: LinhaDaAnalise[] = todos.map((l) => {
    const mov = movPorId.get(l.id);
    const gasto = gastoPorId.get(l.id);
    return {
      id: l.id,
      data: l.data,
      competencia: l.competencia,
      tipo: l.tipo,
      natureza: l.natureza,
      sentido: sentidoDe(l),
      status: l.status,
      valor: l.valor,
      descricao: l.descricao,
      origem: l.origem,
      conta: l.contaBancariaId !== null ? (nomeDaConta.get(l.contaBancariaId) ?? `conta ${l.contaBancariaId}`) : null,
      contaDestino: mov?.contaDestinoId != null ? (nomeDaConta.get(mov.contaDestinoId) ?? `conta ${mov.contaDestinoId}`) : null,
      cartao: l.cartaoId !== null ? (nomeDoCartao.get(l.cartaoId) ?? `cartão ${l.cartaoId}`) : null,
      categoria: l.categoriaId !== null ? (nomeDaCategoria.get(l.categoriaId) ?? `categoria ${l.categoriaId}`) : null,
      membro: l.membroId !== null ? (nomeDoMembro.get(l.membroId) ?? `membro ${l.membroId}`) : null,
      noCartao: l.noCartao,
      importacaoId: mov?.importacaoId ?? gasto?.importacaoId ?? null,
    };
  });

  const realizados = todos.filter((l) => l.status === 'pago');
  const meses = [...new Set(todos.map((l) => l.competencia))].sort().map((mes): MesDaAnalise => {
    const doMes = lancamentos.filter((l) => l.competencia === mes);
    const somar = (filtro: (l: LinhaDaAnalise) => boolean) => doMes.filter(filtro).reduce((s, l) => s + l.valor, 0);
    const compromissos = calcularGastosFixosDoMes(contasFixas, parcelas, mes, dados.comprasParceladas ?? [], cartoes, gastos);
    return {
      mes,
      realizado: numerosDoMes(realizados, mes),
      comPrevistos: numerosDoMes(todos, mes),
      transferencias: {
        entraram: somar((l) => l.natureza === 'transferencia' && l.sentido === 'entra'),
        sairam: somar((l) => l.natureza === 'transferencia' && l.sentido === 'sai'),
        entreContas: somar((l) => l.natureza === 'transferencia' && l.sentido === 'entre_contas'),
      },
      faturas: somar((l) => l.natureza === 'fatura'),
      pagamentosDeCompromisso: somar((l) => l.natureza === 'pagamento'),
      livreParaGastar: calcularLivreParaGastar(todos, mes, hoje),
      compromissos: {
        total: compromissos.total,
        totalPago: compromissos.totalPago,
        totalPendente: compromissos.totalPendente,
        porTipo: compromissos.porTipo,
        itens: compromissos.itens.map((i) => ({ nome: i.nome, tipo: i.tipo, valor: i.valor, paga: i.paga })),
      },
    };
  });

  return {
    geradoEm: p.geradoEm,
    hoje,
    contas: p.contas.map((c) => ({
      id: c.id,
      nome: c.nomeConta,
      banco: c.banco,
      identificador: c.identificadorExtrato ?? null,
      ativa: c.ativo !== false,
      saldoInicial: c.saldoInicial,
      saldoHoje: calcularSaldoConta(
        c,
        movimentacoes.filter((m) => m.data <= hoje),
        gastos.filter((g) => g.data <= hoje)
      ),
      saldoComFuturos: calcularSaldoConta(c, movimentacoes, gastos),
    })),
    cartoes: cartoes.map((c) => ({ id: c.id, nome: c.nome, limite: c.limite, diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento, ativo: c.ativo !== false })),
    contasFixas: contasFixas.map((c) => ({
      id: c.id,
      nome: c.nome,
      valor: c.valor,
      ativa: c.ativo !== false,
      formaPagamento: c.formaPagamento,
      recorrencia: c.recorrencia,
      ocorrencias: parcelas.filter((x) => x.contaFixaId === c.id).length,
    })),
    meses,
    lancamentos,
  };
}
