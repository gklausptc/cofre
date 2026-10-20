import type { DadosGastoRapido } from '@/domain/repositories/gastosRapidosRepository';
import type { DadosMovimentacao } from '@/domain/repositories/movimentacoesRepository';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';

export type TipoPergunta = 'categoria' | 'pix_pessoa' | 'parcelamento' | 'recorrencia' | 'duplicidade';

/** Uma linha importada que a resposta vai mudar (achada pelo id externo dentro da importação). */
export type LinhaDaPergunta = {
  /** null enquanto a importação não foi gravada (o repositório preenche). */
  importacaoId: number | null;
  idExterno: string;
  onde: 'movimentacao' | 'gasto';
};

export type DadosDaPergunta =
  | {
      tipo: 'categoria';
      natureza: 'despesa' | 'receita';
      /** Texto da regra que "Sempre fazer assim" cria. */
      padrao: string;
      /** Descrição original do extrato, para mostrar. */
      exemplo: string;
      sugestaoCategoriaId: number | null;
      linhas: LinhaDaPergunta[];
    }
  | {
      tipo: 'pix_pessoa';
      natureza: 'despesa' | 'receita';
      /** Nome normalizado (vira o contato PIX). */
      nome: string;
      exemplo: string;
      linhas: LinhaDaPergunta[];
    }
  | {
      tipo: 'parcelamento';
      descricao: string;
      valorParcela: number;
      numero: number;
      total: number;
      cartaoId: number;
      /** Fatura ('YYYY-MM' de vencimento) em que a parcela `numero` caiu. */
      mesDaFatura: string;
      dataCompra: string;
      categoriaId: number | null;
      membroId: number | null;
      linhas: LinhaDaPergunta[];
    }
  | {
      tipo: 'recorrencia';
      /** Nome sugerido para a conta fixa. */
      nome: string;
      padrao: string;
      valor: number;
      dia: number;
      /** Meses ('YYYY-MM') em que apareceu. */
      meses: string[];
      assinatura: boolean;
      destino: DestinoImportacao;
      categoriaId: number | null;
      linhas: LinhaDaPergunta[];
    }
  | {
      tipo: 'duplicidade';
      /** A linha do extrato que não entrou (pode ser algo que você já lançou). */
      linha: { data: string; descricao: string; valor: number; idExterno: string };
      existente: { descricao: string; data: string; valor: number };
      /** O que gravar se você disser que são diferentes. */
      registro: { movimentacao: DadosMovimentacao | null; gasto: DadosGastoRapido | null };
      linhas: LinhaDaPergunta[];
    };

/** Pergunta montada na importação, antes de gravar. */
export type PerguntaNova = {
  tipo: TipoPergunta;
  chave: string;
  titulo: string;
  pista: string;
  /** Impacto em centavos (soma das linhas). */
  valor: number;
  quantidade: number;
  dados: DadosDaPergunta;
};
