/**
 * Fábricas de entidades para os testes: cada uma devolve um registro completo com
 * valores neutros, e o teste só sobrescreve o que importa para o cenário.
 */
import type {
  AporteCofrinho,
  Cartao,
  Categoria,
  Cofrinho,
  CompraParcelada,
  ContaBancaria,
  ContaFixa,
  Fatura,
  GastoRapido,
  Movimentacao,
  Parcela,
} from '@/domain/types/entities';

let ultimoId = 1000;
const proximoId = () => ++ultimoId;

export function umaConta(dados: Partial<ContaBancaria> = {}): ContaBancaria {
  return {
    id: proximoId(),
    banco: 'Banco',
    nomeConta: 'Conta corrente',
    saldoInicial: 0,
    cor: '#2A5CE0',
    icone: 'credit-card',
    ativo: true,
    ...dados,
  };
}

export function umaMovimentacao(dados: Partial<Movimentacao> = {}): Movimentacao {
  return {
    id: proximoId(),
    contaBancariaId: 1,
    tipo: 'saida',
    valor: 0,
    data: '2026-01-01',
    descricao: null,
    categoriaId: null,
    contaDestinoId: null,
    origem: 'manual',
    membroId: null,
    reservarProximoMes: false,
    recorrente: false,
    recorrenteOrigemId: null,
    faturaId: null,
    parcelaId: null,
    importacaoId: null,
    idExterno: null,
    ...dados,
  };
}

export function umGasto(dados: Partial<GastoRapido> = {}): GastoRapido {
  return {
    id: proximoId(),
    valor: 0,
    categoriaId: null,
    descricao: null,
    data: '2026-01-01',
    formaPagamento: 'dinheiro',
    contaBancariaId: null,
    cartaoId: null,
    membroId: null,
    valorOriginal: null,
    justificativaAlteracao: null,
    importacaoId: null,
    idExterno: null,
    ...dados,
  };
}

export function umCartao(dados: Partial<Cartao> = {}): Cartao {
  return {
    id: proximoId(),
    nome: 'Cartão',
    limite: 0,
    diaFechamento: 25,
    diaVencimento: 5,
    cor: '#2A5CE0',
    ativo: true,
    ...dados,
  };
}

export function umaCompra(dados: Partial<CompraParcelada> = {}): CompraParcelada {
  return {
    id: proximoId(),
    descricao: 'Compra',
    valorTotal: 0,
    numParcelas: 1,
    cartaoId: 1,
    categoriaId: null,
    dataCompra: '2026-01-01',
    membroId: null,
    ativo: true,
    ...dados,
  };
}

export function umaParcela(dados: Partial<Parcela> = {}): Parcela {
  return {
    id: proximoId(),
    compraParceladaId: null,
    contaFixaId: null,
    numero: 1,
    valor: 0,
    mesReferencia: '2026-01',
    faturaId: null,
    status: 'pendente',
    dataPagamento: null,
    valorOriginal: null,
    justificativaAlteracao: null,
    ...dados,
  };
}

export function umaContaFixa(dados: Partial<ContaFixa> = {}): ContaFixa {
  return {
    id: proximoId(),
    nome: 'Conta fixa',
    categoriaId: null,
    valor: 0,
    diaVencimento: 10,
    formaPagamento: 'debito',
    contaBancariaId: null,
    cartaoId: null,
    recorrencia: 'mensal',
    dataInicio: '2026-01-01',
    dataFim: null,
    membroId: null,
    ativo: true,
    ...dados,
  };
}

export function umaFatura(dados: Partial<Fatura> = {}): Fatura {
  return {
    id: proximoId(),
    cartaoId: 1,
    mesReferencia: '2026-01',
    dataFechamento: '2025-12-25',
    dataVencimento: '2026-01-05',
    status: 'aberta',
    contaBancariaId: null,
    valorPago: null,
    dataPagamento: null,
    ...dados,
  };
}

export function umaCategoria(dados: Partial<Categoria> = {}): Categoria {
  return {
    id: proximoId(),
    nome: 'Categoria',
    icone: 'tag',
    cor: '#666E7E',
    tipo: 'despesa',
    isPadrao: false,
    ...dados,
  };
}

export function umAporte(dados: Partial<AporteCofrinho> = {}): AporteCofrinho {
  return {
    id: proximoId(),
    cofrinhoId: 1,
    valor: 0,
    data: '2026-01-01',
    ...dados,
  };
}

export function umCofrinho(dados: Partial<Cofrinho> = {}): Cofrinho {
  return {
    id: proximoId(),
    nome: 'Cofrinho',
    valorMeta: 0,
    dataMeta: null,
    cor: '#06B6D4',
    icone: 'gift',
    status: 'ativo',
    indexador: 'nenhum',
    percentualIndexador: 10000,
    cobraIr: false,
    ...dados,
  };
}
