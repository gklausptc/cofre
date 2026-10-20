/** Tipos do pipeline de importação de extrato (ver CLAUDE.md, Fase 2). */

export type BancoId = 'bb' | 'santander' | 'bradesco' | 'itau' | 'nubank' | 'c6' | 'picpay' | 'infinitepay';

/** Extrato de conta (entradas e saídas) ou fatura de cartão (compras, pagamentos, estornos). */
export type OrigemExtrato = 'conta' | 'cartao';

export type MarcaParcela = { numero: number; total: number };

/**
 * Uma linha do extrato já lida. Convenção de sinal, igual para todos os bancos:
 * - conta: negativo = saída, positivo = entrada;
 * - cartão: positivo = compra, negativo = pagamento da fatura ou estorno.
 */
export type TransacaoLida = {
  data: string;
  descricao: string;
  /** Em centavos, com sinal (ver acima). */
  valor: number;
  /** Identifica a linha entre importações: FITID do OFX ou um hash da linha. */
  idExterno: string;
  /** Parcela informada pelo banco numa coluna própria (a do texto vem de normalizarDescricao). */
  parcela: MarcaParcela | null;
  /** Número da linha no arquivo (1 = primeira), para mensagens. */
  linha: number;
  /** Categoria que o banco deu à compra, quando o arquivo traz (fatura do C6). */
  categoriaDoBanco?: string;
};

/** Agência, número e tipo da conta, quando o extrato diz. */
export type DadosDaConta = { agencia: string | null; numero: string | null; tipo: 'corrente' | 'poupanca' | null };

/** O que a fatura diz do cartão (para criar o cartão na importação em lote). */
export type DadosDoCartao = { nome: string | null; limite: number | null; diaFechamento: number | null; diaVencimento: number | null };

export type ExtratoLido = {
  /** 'txt' é a fatura Ourocard do BB, em largura fixa. */
  formato: 'ofx' | 'csv' | 'txt' | 'pdf';
  banco: BancoId | null;
  /** Detectada pelo arquivo; null quando não dá para saber (o usuário escolhe). */
  origem: OrigemExtrato | null;
  transacoes: TransacaoLida[];
  /** Linhas que não viraram transação (saldo, totais, datas inválidas…). */
  ignoradas: number;
  periodo: { inicio: string; fim: string } | null;
  /** Vencimento da fatura, quando o arquivo informa (só em faturas de cartão). */
  vencimentoFatura: string | null;
  /** Nome do titular ("Cliente: FULANO"), para reconhecer PIX para si mesmo. */
  titular?: string | null;
  /** Qual conta é: liga os próximos arquivos à mesma conta do app. */
  conta?: DadosDaConta | null;
  /** Saldo antes do primeiro lançamento ("Saldo Anterior"): conta criada na importação já nasce certa. */
  saldoAnterior?: number | null;
  /** Fatura: nome, limite e dias do cartão, quando o arquivo diz. */
  cartao?: DadosDoCartao | null;
};
