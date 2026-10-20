import { addMonths, format, parseISO, subMonths } from 'date-fns';
import { dataFechamentoDaFatura, dataNoMes, mesVencimentoDaFatura } from '@/domain/usecases/mesDaFatura';
import { semelhanca } from './deduplicar';
import { normalizarDescricao } from './normalizarDescricao';
import { limparDescricaoDaParcela } from './detectarPadroes';
import type { DadosRegraCategorizacao } from '@/domain/repositories/importacoesRepository';
import type { DadosContatoPix } from '@/domain/repositories/regrasRepository';
import type { DadosContaFixa } from '@/domain/repositories/contasFixasRepository';
import type { DadosCompraParcelada } from '@/domain/repositories/comprasParceladasRepository';
import type { DadosGastoRapido } from '@/domain/repositories/gastosRapidosRepository';
import type { DadosMovimentacao } from '@/domain/repositories/movimentacoesRepository';
import type { Cartao, ContatoPix, GastoRapido } from '@/domain/types/entities';
import type { DadosDaPergunta, LinhaDaPergunta } from '@/domain/types/perguntas';

/** O que você respondeu na tela de revisão. */
export type RespostaPergunta =
  | { tipo: 'categoria'; categoriaId: number; sempre: boolean }
  | { tipo: 'transferencia_propria'; outraContaId: number | null; sempre: boolean }
  /** Não era para ter entrado: apaga as linhas. */
  | { tipo: 'ignorar'; sempre: boolean }
  | {
      tipo: 'contato';
      contato: ContatoPix['tipo'];
      apelido: string;
      categoriaId: number | null;
      membroId: number | null;
      /** Só para 'propria': a outra conta sua (null = fora do app). */
      outraContaId: number | null;
      sempre: boolean;
    }
  | { tipo: 'parcelamento'; criar: boolean }
  | { tipo: 'recorrencia'; criar: boolean; nome: string; valor: number; dia: number; sempre: boolean }
  | { tipo: 'duplicidade'; mesmo: boolean };

/** O que gravar para aplicar a resposta (o repositório executa numa transação). */
export type PlanoDeResposta = {
  linhas: LinhaDaPergunta[];
  /** Muda categoria/membro das linhas. */
  atualizarLinhas: { categoriaId: number | null; membroId?: number | null } | null;
  /**
   * Linhas de conta viram transferência entre contas suas. Saídas: para `contaDestinoId`
   * (null = fora do app). Entradas: só quando a origem é conhecida (`origemDasEntradas`).
   */
  transferencia: { contaDestinoId: number | null; origemDasEntradas: number | null } | null;
  apagarLinhas: boolean;
  /** Gastos de importações antigas que viram parcelas pagas da compra criada. */
  apagarGastos: number[];
  regra: DadosRegraCategorizacao | null;
  contato: DadosContatoPix | null;
  compraParcelada: {
    dados: DadosCompraParcelada;
    /** Mês de fechamento da fatura da 1ª parcela. */
    mesPrimeiraParcela: string;
    /** Parcelas anteriores à do extrato: já pagas, com a data do vencimento de cada fatura. */
    pagas: { numero: number; dataPagamento: string }[];
  } | null;
  /** A regra de conta fixa (se "sempre") recebe o id da conta criada. */
  contaFixa: { dados: DadosContaFixa; regra: DadosRegraCategorizacao | null } | null;
  inserir: { movimentacao: DadosMovimentacao | null; gasto: DadosGastoRapido | null } | null;
};

const PLANO_VAZIO: Omit<PlanoDeResposta, 'linhas'> = {
  atualizarLinhas: null,
  transferencia: null,
  apagarLinhas: false,
  apagarGastos: [],
  regra: null,
  contato: null,
  compraParcelada: null,
  contaFixa: null,
  inserir: null,
};

function regra(
  padrao: string,
  natureza: 'despesa' | 'receita' | 'ambas',
  agora: Date,
  extra: Partial<DadosRegraCategorizacao>
): DadosRegraCategorizacao {
  return {
    padrao,
    tipoCorrespondencia: 'contem',
    natureza,
    categoriaId: null,
    membroId: null,
    acao: 'categorizar',
    contaFixaId: null,
    criadaEm: agora.toISOString(),
    vezesUsada: 0,
    ...extra,
  };
}

/** Contexto que algumas respostas precisam (cartão e gastos para a compra parcelada). */
export type ContextoDaResposta = {
  agora: Date;
  cartoes: Pick<Cartao, 'id' | 'diaFechamento' | 'diaVencimento'>[];
  gastos: Pick<GastoRapido, 'id' | 'cartaoId' | 'descricao' | 'valor' | 'formaPagamento' | 'importacaoId' | 'idExterno'>[];
};

/**
 * Decide o que gravar para uma resposta. Puro: recebe a pergunta e a resposta, devolve o
 * plano. "Sempre fazer assim" cria a regra (ou o contato PIX) para as próximas importações.
 */
export function planejarResposta(
  dados: DadosDaPergunta,
  resposta: RespostaPergunta,
  contexto: ContextoDaResposta
): PlanoDeResposta {
  const { agora } = contexto;
  const plano: PlanoDeResposta = { ...PLANO_VAZIO, linhas: dados.linhas };

  if (dados.tipo === 'duplicidade') {
    if (resposta.tipo !== 'duplicidade' || resposta.mesmo) return plano;
    return { ...plano, inserir: dados.registro };
  }

  if (dados.tipo === 'parcelamento') {
    if (resposta.tipo !== 'parcelamento' || !resposta.criar) return plano;
    const cartao = contexto.cartoes.find((c) => c.id === dados.cartaoId);
    if (!cartao) return plano;
    // mês de fechamento da fatura em que a parcela `numero` caiu; a 1ª fica (numero − 1) meses antes
    const fechamentoAtual = dataFechamentoDaFatura(dados.mesDaFatura, cartao).slice(0, 7);
    const mesPrimeiraParcela = format(subMonths(parseISO(`${fechamentoAtual}-01`), dados.numero - 1), 'yyyy-MM');
    const pagas = Array.from({ length: dados.numero - 1 }, (_, i) => {
      const numero = i + 1;
      const fechamento = format(addMonths(parseISO(`${mesPrimeiraParcela}-01`), i), 'yyyy-MM');
      return { numero, dataPagamento: dataNoMes(mesVencimentoDaFatura(fechamento, cartao), cartao.diaVencimento) };
    });
    // parcelas antigas já importadas como gasto ("LOJA 02/10" na fatura passada) viram parcelas pagas
    const idsDaPergunta = new Set(dados.linhas.map((l) => l.idExterno));
    const antigas = contexto.gastos.filter((g) => {
      if (g.formaPagamento !== 'cartao' || g.cartaoId !== dados.cartaoId || !g.descricao) return false;
      if (g.idExterno && idsDaPergunta.has(g.idExterno)) return false;
      const marca = normalizarDescricao(g.descricao).parcela;
      return (
        marca !== null &&
        marca.total === dados.total &&
        marca.numero < dados.numero &&
        Math.abs(g.valor - dados.valorParcela) <= 2 &&
        semelhanca(limparDescricaoDaParcela(g.descricao), dados.descricao) >= 0.6
      );
    });
    return {
      ...plano,
      apagarLinhas: true,
      apagarGastos: antigas.map((g) => g.id),
      compraParcelada: {
        dados: {
          descricao: dados.descricao,
          valorTotal: dados.valorParcela * dados.total,
          numParcelas: dados.total,
          cartaoId: dados.cartaoId,
          categoriaId: dados.categoriaId,
          dataCompra: dados.dataCompra,
          membroId: dados.membroId,
        },
        mesPrimeiraParcela,
        pagas,
      },
    };
  }

  if (dados.tipo === 'recorrencia') {
    if (resposta.tipo !== 'recorrencia' || !resposta.criar) return plano;
    const ultimoMes = [...dados.meses].sort().pop() ?? format(agora, 'yyyy-MM');
    const inicio = format(addMonths(parseISO(`${ultimoMes}-01`), 1), 'yyyy-MM-dd');
    const noCartao = dados.destino.tipo === 'cartao';
    return {
      ...plano,
      contaFixa: {
        dados: {
          nome: resposta.nome.trim() || dados.nome,
          categoriaId: dados.categoriaId,
          valor: resposta.valor,
          diaVencimento: Math.min(Math.max(resposta.dia, 1), 31),
          formaPagamento: noCartao ? 'cartao' : 'debito',
          contaBancariaId: dados.destino.tipo === 'conta' ? dados.destino.contaBancariaId : null,
          cartaoId: dados.destino.tipo === 'cartao' ? dados.destino.cartaoId : null,
          recorrencia: 'mensal',
          dataInicio: inicio,
          dataFim: null,
          membroId: null,
        },
        regra: resposta.sempre && dados.padrao !== '' ? regra(dados.padrao, 'despesa', agora, { acao: 'conta_fixa' }) : null,
      },
    };
  }

  // categoria ou PIX para pessoa
  const natureza = dados.natureza;
  const padrao = dados.tipo === 'categoria' ? dados.padrao : dados.nome;

  if (resposta.tipo === 'categoria') {
    return {
      ...plano,
      atualizarLinhas: { categoriaId: resposta.categoriaId },
      regra:
        resposta.sempre && dados.tipo === 'categoria' && padrao !== ''
          ? regra(padrao, natureza, agora, { categoriaId: resposta.categoriaId })
          : null,
      contato:
        resposta.sempre && dados.tipo === 'pix_pessoa'
          ? { nomeNormalizado: dados.nome, apelido: dados.nome, categoriaId: resposta.categoriaId, membroId: null, tipo: 'pessoa', criadoEm: agora.toISOString() }
          : null,
    };
  }

  if (resposta.tipo === 'transferencia_propria') {
    return {
      ...plano,
      transferencia: { contaDestinoId: resposta.outraContaId, origemDasEntradas: resposta.outraContaId },
      regra: resposta.sempre && dados.tipo === 'categoria' && padrao !== '' ? regra(padrao, 'ambas', agora, { acao: 'transferencia_propria' }) : null,
      contato:
        resposta.sempre && dados.tipo === 'pix_pessoa'
          ? { nomeNormalizado: dados.nome, apelido: dados.nome, categoriaId: null, membroId: null, tipo: 'propria', criadoEm: agora.toISOString() }
          : null,
    };
  }

  if (resposta.tipo === 'ignorar') {
    return {
      ...plano,
      apagarLinhas: true,
      regra: resposta.sempre && padrao !== '' ? regra(padrao, natureza, agora, { acao: 'ignorar' }) : null,
    };
  }

  if (resposta.tipo === 'contato') {
    const contato: DadosContatoPix | null = resposta.sempre
      ? {
          nomeNormalizado: padrao,
          apelido: resposta.apelido.trim() || padrao,
          categoriaId: resposta.categoriaId,
          membroId: resposta.membroId,
          tipo: resposta.contato,
          criadoEm: agora.toISOString(),
        }
      : null;
    if (resposta.contato === 'propria') {
      return { ...plano, contato, transferencia: { contaDestinoId: resposta.outraContaId, origemDasEntradas: resposta.outraContaId } };
    }
    if (resposta.contato === 'emprestimo') {
      // dinheiro emprestado sai do saldo, mas não é gasto: vira transferência para fora do app
      return { ...plano, contato, transferencia: { contaDestinoId: null, origemDasEntradas: null } };
    }
    return { ...plano, contato, atualizarLinhas: { categoriaId: resposta.categoriaId, membroId: resposta.membroId } };
  }

  return plano;
}
