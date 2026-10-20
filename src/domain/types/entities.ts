import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type * as schema from '@/data/db/schema';

export type Categoria = InferSelectModel<typeof schema.categorias>;
export type NovaCategoria = InferInsertModel<typeof schema.categorias>;

export type ContaBancaria = InferSelectModel<typeof schema.contasBancarias>;
export type NovaContaBancaria = InferInsertModel<typeof schema.contasBancarias>;

export type Movimentacao = InferSelectModel<typeof schema.movimentacoes>;
export type NovaMovimentacao = InferInsertModel<typeof schema.movimentacoes>;

export type Cartao = InferSelectModel<typeof schema.cartoes>;
export type NovoCartao = InferInsertModel<typeof schema.cartoes>;

export type Fatura = InferSelectModel<typeof schema.faturas>;
export type NovaFatura = InferInsertModel<typeof schema.faturas>;

export type CompraParcelada = InferSelectModel<typeof schema.comprasParceladas>;
export type NovaCompraParcelada = InferInsertModel<typeof schema.comprasParceladas>;

export type Parcela = InferSelectModel<typeof schema.parcelas>;
export type NovaParcela = InferInsertModel<typeof schema.parcelas>;

export type ContaFixa = InferSelectModel<typeof schema.contasFixas>;
export type NovaContaFixa = InferInsertModel<typeof schema.contasFixas>;

export type GastoRapido = InferSelectModel<typeof schema.gastosRapidos>;
export type NovoGastoRapido = InferInsertModel<typeof schema.gastosRapidos>;

export type Cofrinho = InferSelectModel<typeof schema.cofrinhos>;
export type NovoCofrinho = InferInsertModel<typeof schema.cofrinhos>;

export type AporteCofrinho = InferSelectModel<typeof schema.aportesCofrinho>;

export type ReservaEmergencia = InferSelectModel<typeof schema.reservaEmergencia>;

export type MovimentacaoReserva = InferSelectModel<typeof schema.movimentacoesReserva>;

export type MetaFinanceira = InferSelectModel<typeof schema.metasFinanceiras>;

export type MembroFamilia = InferSelectModel<typeof schema.membrosFamilia>;

export type Importacao = InferSelectModel<typeof schema.importacoes>;
export type NovaImportacao = InferInsertModel<typeof schema.importacoes>;

export type RegraCategorizacao = InferSelectModel<typeof schema.regrasCategorizacao>;
export type NovaRegraCategorizacao = InferInsertModel<typeof schema.regrasCategorizacao>;

export type PerguntaPendente = InferSelectModel<typeof schema.perguntasPendentes>;

export type Orcamento = InferSelectModel<typeof schema.orcamentos>;
export type NovoOrcamento = InferInsertModel<typeof schema.orcamentos>;

export type ContatoPix = InferSelectModel<typeof schema.contatosPix>;
export type NovoContatoPix = InferInsertModel<typeof schema.contatosPix>;

export type Preferencias = InferSelectModel<typeof schema.preferencias>;
export type PreferenciasAtualizaveis = Partial<Omit<InferInsertModel<typeof schema.preferencias>, 'id'>>;
