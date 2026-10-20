import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { calcularPagamentosDoMes } from '@/domain/usecases/calcularPagamentosDoMes';
import { dataFechamentoDaFatura, dataNoMes, mesDeCobrancaDoGasto } from '@/domain/usecases/mesDaFatura';
import { formatarMoeda } from '@/core/utils/currency';
import { formatarData } from '@/core/utils/date';
import { bancoPorTexto } from './bancos';
import { semelhanca } from './deduplicar';
import { normalizarDescricao, semAcentos } from './normalizarDescricao';
import { pareceNomeDePessoa, textoParaRegra, type Categorizacao } from './categorizar';
import { contemNomeProprio } from './nomesProprios';
import type { DestinoImportacao } from '@/domain/usecases/prepararImportacaoExtrato';
import type {
  Cartao,
  CompraParcelada,
  ContaBancaria,
  ContaFixa,
  Fatura,
  GastoRapido,
  Movimentacao,
  Parcela,
} from '@/domain/types/entities';
import type { TransacaoLida } from './tipos';

/** O que já está no app, para casar com as linhas do extrato. */
export type DadosParaConciliar = {
  contas: Pick<ContaBancaria, 'id' | 'banco' | 'nomeConta'>[];
  cartoes: Cartao[];
  contasFixas: ContaFixa[];
  parcelas: Parcela[];
  compras: CompraParcelada[];
  gastos: GastoRapido[];
  faturas: Fatura[];
  movimentacoes: Movimentacao[];
  /** Nomes do titular (PIX para o próprio nome é transferência entre contas suas). */
  nomesProprios?: string[];
};

/**
 * O que uma linha do extrato é, além de um gasto ou entrada comum:
 * - conta_fixa: paga uma ocorrência de conta fixa (dá baixa e liga a saída a ela);
 * - fatura: paga a fatura de um cartão (dá baixa; a saída não é despesa). `fatura` null quando
 *   o texto diz que é pagamento de fatura, mas o cartão não está no app;
 * - ja_paga: o app já tem esse pagamento (você marcou a conta ou a fatura como paga);
 * - ja_na_fatura: na fatura do cartão, a compra já está no app como parcela ou conta fixa;
 * - transferencia_propria: dinheiro entre contas suas, poupança ou aplicação (não é despesa nem
 *   receita);
 * - receita_prevista: confirma a entrada recorrente (salário) que o app já tinha lançado;
 * - salario: entrada que é salário (pelo texto ou porque se repete todo mês).
 */
export type Conciliacao =
  | {
      tipo: 'conta_fixa';
      parcelaId: number;
      contaFixaId: number;
      nome: string;
      categoriaId: number | null;
      membroId: number | null;
      motivo: string;
    }
  | {
      tipo: 'fatura';
      fatura: {
        cartaoId: number;
        mesReferencia: string;
        dataFechamento: string;
        dataVencimento: string;
        parcelaIds: number[];
      } | null;
      motivo: string;
    }
  | { tipo: 'ja_paga'; existenteId: string; motivo: string }
  | { tipo: 'ja_na_fatura'; motivo: string }
  | {
      tipo: 'transferencia_propria';
      /** A outra conta sua envolvida (null = fora do app ou desconhecida). */
      outraContaId: number | null;
      /** O outro lado já está no app (importado da outra conta): ele vira a transferência. */
      contraparteId: number | null;
      motivo: string;
    }
  | { tipo: 'receita_prevista'; movimentacaoId: number; motivo: string }
  | { tipo: 'salario'; motivo: string };

export const TOLERANCIA_VALOR_CONTA_FIXA = 0.05;
export const TOLERANCIA_DIAS_CONTA_FIXA = 5;

type ContaFixaAberta = {
  parcelaId: number;
  conta: ContaFixa;
  valor: number;
  vencimento: string;
};

type FaturaAberta = {
  cartao: Cartao;
  mesReferencia: string;
  total: number;
  pendente: number;
  vencimento: string;
  paga: boolean;
  parcelaIds: number[];
};

type ItemNaFatura = {
  cartaoId: number;
  mesReferencia: string;
  nome: string;
  valor: number;
  /** Parcela de compra: "3 de 10". */
  numero: number | null;
  total: number | null;
  contaFixa: boolean;
};

const dias = (a: string, b: string) => Math.abs(differenceInCalendarDays(parseISO(a), parseISO(b)));
const dentroDaTolerancia = (valor: number, esperado: number, tolerancia: number) =>
  Math.abs(valor - esperado) <= Math.max(1, Math.round(esperado * tolerancia));

/** Meses ('YYYY-MM') de um mês antes do início a um depois do fim do extrato. */
function mesesAoRedor(datas: string[]): string[] {
  if (datas.length === 0) return [];
  const ordenadas = [...datas].sort();
  const inicio = addMonths(parseISO(`${ordenadas[0].slice(0, 7)}-01`), -1);
  const fim = addMonths(parseISO(`${ordenadas[ordenadas.length - 1].slice(0, 7)}-01`), 1);
  const meses: string[] = [];
  for (let mes = inicio; mes <= fim; mes = addMonths(mes, 1)) meses.push(format(mes, 'yyyy-MM'));
  return meses;
}

/** Contas fixas, faturas e itens de fatura dos meses que o extrato cobre. */
function compromissosDosMeses(dados: DadosParaConciliar, meses: string[]) {
  const parcelasPorId = new Map(dados.parcelas.map((p) => [p.id, p]));
  const contasPorId = new Map(dados.contasFixas.map((c) => [c.id, c]));
  const comprasPorId = new Map(dados.compras.map((c) => [c.id, c]));
  const contasFixas: ContaFixaAberta[] = [];
  const faturas: FaturaAberta[] = [];
  const itensNaFatura: ItemNaFatura[] = [];

  for (const mes of meses) {
    const pagamentos = calcularPagamentosDoMes(
      dados.contasFixas,
      dados.parcelas,
      dados.compras,
      dados.cartoes,
      dados.gastos,
      dados.faturas,
      mes
    );
    for (const grupo of pagamentos.grupos) {
      if (grupo.cartao === null) {
        for (const item of grupo.itens) {
          const parcela = parcelasPorId.get(item.origemId);
          const conta = parcela?.contaFixaId != null ? contasPorId.get(parcela.contaFixaId) : undefined;
          if (item.tipo !== 'parcela' || item.paga || !conta || !item.vencimento) continue;
          contasFixas.push({ parcelaId: item.origemId, conta, valor: item.valor, vencimento: item.vencimento });
        }
        continue;
      }
      faturas.push({
        cartao: grupo.cartao,
        mesReferencia: mes,
        total: grupo.total,
        pendente: grupo.pendente,
        vencimento: dataNoMes(mes, grupo.cartao.diaVencimento),
        paga: grupo.faturaPaga,
        parcelaIds: grupo.itens.filter((i) => i.tipo === 'parcela' && !i.paga).map((i) => i.origemId),
      });
      for (const item of grupo.itens) {
        if (item.tipo !== 'parcela') continue;
        const parcela = parcelasPorId.get(item.origemId);
        if (!parcela) continue;
        const compra = parcela.compraParceladaId !== null ? comprasPorId.get(parcela.compraParceladaId) : undefined;
        itensNaFatura.push({
          cartaoId: grupo.cartao.id,
          mesReferencia: mes,
          nome: item.nome,
          valor: item.valor,
          numero: compra ? parcela.numero : null,
          total: compra ? compra.numParcelas : null,
          contaFixa: parcela.contaFixaId !== null,
        });
      }
    }
  }
  return { contasFixas, faturas, itensNaFatura };
}

/** Texto de pagamento de fatura de cartão no extrato da conta. */
const PAGAMENTO_DE_FATURA =
  /\bFATURA\b|\b(PAG(TO|AMENTO)?|PGTO)\.? (DE )?(FAT|CARTAO|CART CRED|CARTAO DE CREDITO|CARTAO CREDITO)\b|\bCARTAO DE CREDITO\b/;
/** Transferência entre contas do mesmo titular. */
const MESMA_TITULARIDADE = /MESMA TITULARIDADE|MESMO TITULAR|ENTRE CONTAS|CONTA PROPRIA|CONTAS PROPRIAS/;
/** Dinheiro que vai para (ou volta de) aplicação no próprio banco. */
const APLICACAO =
  /\b(APLICACAO|APLIC|RESGATE|RESG|CDB|RDB|LCI|LCA|CAIXINHA|CAIXINHAS|COFRINHO|COFRINHOS|PORQUINHO|INVESTIMENTO|TESOURO DIRETO|POUPANCA|POUP|RENDE FACIL|DINHEIRO GUARDADO|DINHEIRO RESGATADO|GUARDADO NO|RESGATADO DO)\b/;
/** Rendimento da aplicação é receita, não dinheiro voltando ("REND APLIC", "JUROS POUPANCA"). */
const RENDIMENTO = /\b(REND|RENDIMENTO|RENDIMENTOS|JUROS|REMUNERACAO|DIVIDENDOS?|PROVENTO)\b/;
/** Poupança: casa com a conta poupança do app, quando houver só uma. */
const POUPANCA = /\bPOUP(ANCA)?\b/;
/** Linha com cara de transferência (para aceitar o outro lado como contraparte). */
const PARECE_TRANSFERENCIA = /\b(PIX|TRANSF|TRANSFERENCIA|TRANSFERIDO|TRANSFERIDA|TED|DOC|TEV)\b/;
/** Entrada de salário pelo texto. */
const SALARIO = /\b(SALARIO|SALARIOS|FOLHA|PROVENTOS|VENCIMENTOS|PAGTO SALARIO|CRED SALARIO|HOLERITE)\b/;

export const VALOR_MINIMO_SALARIO = 30000;

/**
 * Para cada linha do extrato, o que ela é além de um lançamento comum (ou null). Cada conta
 * fixa, fatura, contraparte ou receita prevista casa com no máximo uma linha.
 * `categorizacoes` vem de `prepararCategorizador` (regras e contatos podem dizer que é
 * transferência própria); `mesDaFatura` é a fatura escolhida na importação de cartão.
 */
export function conciliarExtrato(
  transacoes: TransacaoLida[],
  categorizacoes: (Categorizacao | null)[],
  destino: DestinoImportacao,
  dados: DadosParaConciliar,
  mesDaFatura: string | null = null
): (Conciliacao | null)[] {
  const cartoesPorId = new Map(dados.cartoes.map((c) => [c.id, c]));
  const mesDeCobranca = (data: string) =>
    destino.tipo === 'cartao'
      ? (mesDaFatura ?? mesDeCobrancaDoGasto({ data, formaPagamento: 'cartao', cartaoId: destino.cartaoId }, cartoesPorId))
      : data.slice(0, 7);
  // na fatura, o que importa é o mês de vencimento (as parcelas vêm com a data da compra antiga)
  const meses = [...new Set(mesesAoRedor(transacoes.map((t) => `${mesDeCobranca(t.data)}-01`)))];
  const { contasFixas, faturas, itensNaFatura } = compromissosDosMeses(dados, meses);
  const usados = new Set<string>();

  if (destino.tipo === 'cartao') {
    return transacoes.map((t) => {
      if (t.valor <= 0) return null;
      const mes = mesDeCobranca(t.data);
      const marca = t.parcela ?? normalizarDescricao(t.descricao).parcela;
      const candidatos = itensNaFatura
        .map((item, indice) => ({ item, chave: `fatura-item-${indice}` }))
        .filter(({ item, chave }) => {
          if (usados.has(chave) || item.cartaoId !== destino.cartaoId || item.mesReferencia !== mes) return false;
          if (item.contaFixa) {
            return (
              dentroDaTolerancia(t.valor, item.valor, TOLERANCIA_VALOR_CONTA_FIXA) &&
              (Math.abs(t.valor - item.valor) <= 1 || semelhanca(item.nome, t.descricao) >= 0.4)
            );
          }
          if (Math.abs(t.valor - item.valor) > 2) return false;
          if (marca && item.numero !== null) return marca.numero === item.numero && marca.total === item.total;
          return semelhanca(item.nome, t.descricao) >= 0.5;
        });
      const escolhido = candidatos[0];
      if (!escolhido) return null;
      usados.add(escolhido.chave);
      const { item } = escolhido;
      return {
        tipo: 'ja_na_fatura',
        motivo: item.contaFixa
          ? `Já está na fatura como a conta fixa ${item.nome}`
          : `Já está na fatura: parcela ${item.numero} de ${item.total} de ${item.nome}`,
      };
    });
  }

  const contaId = destino.contaBancariaId;
  const outrasContas = dados.contas.filter((c) => c.id !== contaId);
  const pagamentosFeitos = dados.movimentacoes.filter(
    (m) => m.contaBancariaId === contaId && m.tipo === 'saida' && (m.faturaId !== null || m.parcelaId !== null) && !m.idExterno
  );
  const receitasPrevistas = dados.movimentacoes.filter(
    (m) =>
      m.contaBancariaId === contaId &&
      m.tipo === 'entrada' &&
      (m.recorrente || m.recorrenteOrigemId !== null) &&
      !m.idExterno &&
      m.importacaoId === null
  );
  const entradasDaConta = dados.movimentacoes.filter((m) => m.contaBancariaId === contaId && m.tipo === 'entrada' && m.origem !== 'interna');

  const nomesProprios = dados.nomesProprios ?? [];
  const ehProprio = (texto: string) => contemNomeProprio(texto, nomesProprios);

  const outraContaPeloTexto = (texto: string): number | null => {
    if (POUPANCA.test(texto)) {
      const poupancas = outrasContas.filter((c) => POUPANCA.test(semAcentos(`${c.nomeConta} ${c.banco}`)));
      if (poupancas.length === 1) return poupancas[0].id;
    }
    const banco = bancoPorTexto(texto);
    if (!banco) return null;
    const doBanco = outrasContas.filter((c) => bancoPorTexto(`${c.banco} ${c.nomeConta}`) === banco);
    return doBanco.length === 1 ? doBanco[0].id : null;
  };

  return transacoes.map((t, indice): Conciliacao | null => {
    const categorizacao = categorizacoes[indice] ?? null;
    const original = semAcentos(t.descricao);
    /** Entre contas suas sem o outro lado no app: regra/contato, seu nome, mesma titularidade, poupança. */
    const transferenciaSemContraparte = (sentido: 'para' | 'de'): Conciliacao | null => {
      const outraContaId = outraContaPeloTexto(original);
      const outraConta = outraContaId !== null ? dados.contas.find((c) => c.id === outraContaId) : undefined;
      const onde = outraConta ? ` ${sentido} ${outraConta.nomeConta}` : '';
      if (categorizacao?.acao === 'transferencia_propria') {
        return { tipo: 'transferencia_propria', outraContaId, contraparteId: null, motivo: `${categorizacao.motivo}${onde}` };
      }
      if (ehProprio(original) || MESMA_TITULARIDADE.test(original)) {
        return { tipo: 'transferencia_propria', outraContaId, contraparteId: null, motivo: `Entre contas suas${onde}` };
      }
      if (APLICACAO.test(original) && !RENDIMENTO.test(original)) {
        const motivo = POUPANCA.test(original)
          ? sentido === 'para' ? 'Guardado na poupança' : 'Resgatado da poupança'
          : sentido === 'para' ? 'Aplicação (dinheiro guardado)' : 'Resgate de aplicação';
        return { tipo: 'transferencia_propria', outraContaId, contraparteId: null, motivo: outraConta ? `${motivo}${onde}` : motivo };
      }
      return null;
    };
    const valor = Math.abs(t.valor);
    const pareceTransferencia = PARECE_TRANSFERENCIA.test(original);
    const nomeNoPix = normalizarDescricao(t.descricao).pix?.nome ?? null;
    const proprioAqui = ehProprio(original);
    const propriaPelaCategoria = categorizacao?.acao === 'transferencia_propria' || proprioAqui;

    // --- transferência própria com o outro lado já no app
    const contraparte = dados.movimentacoes.find((m) => {
      if (usados.has(`mov-${m.id}`) || m.contaBancariaId === contaId || m.valor !== valor || dias(m.data, t.data) > 1) return false;
      if (m.faturaId !== null || m.parcelaId !== null) return false;
      // os dois lados com cara de transferência (ou uma regra dizendo que é), e, se os dois
      // trazem nome de pessoa, o mesmo nome (o seu) — senão é coincidência de valor
      const textoDoOutroLado = semAcentos(m.descricao ?? '');
      const proprioLa = ehProprio(textoDoOutroLado);
      const outroLadoPareceTransferencia =
        PARECE_TRANSFERENCIA.test(textoDoOutroLado) || m.origem === 'interna' || m.tipo === 'transferencia' || proprioLa;
      if (!outroLadoPareceTransferencia || (!pareceTransferencia && !propriaPelaCategoria)) return false;
      // os dois lados com o seu nome (cada banco abrevia de um jeito): é você mesmo
      if (!(proprioAqui && proprioLa)) {
        const nomeDoOutroLado = normalizarDescricao(m.descricao ?? '').pix?.nome ?? null;
        const pessoaAqui = nomeNoPix !== null && pareceNomeDePessoa(nomeNoPix) && !proprioAqui;
        const pessoaLa = nomeDoOutroLado !== null && pareceNomeDePessoa(nomeDoOutroLado) && !proprioLa;
        if (pessoaAqui && pessoaLa && semelhanca(nomeNoPix ?? '', nomeDoOutroLado ?? '') < 0.8) return false;
        // só um dos lados nomeia uma pessoa (PIX para um amigo × TED genérica): coincidência de
        // valor, a não ser que uma regra, um contato ou o seu nome diga que é conta sua
        if (pessoaAqui !== pessoaLa && !propriaPelaCategoria && !proprioLa) return false;
      }
      if (t.valor < 0) return m.tipo === 'entrada';
      return m.tipo === 'saida' || (m.tipo === 'transferencia' && m.contaDestinoId === null);
    });
    if (contraparte) {
      usados.add(`mov-${contraparte.id}`);
      const conta = dados.contas.find((c) => c.id === contraparte.contaBancariaId);
      return {
        tipo: 'transferencia_propria',
        outraContaId: contraparte.contaBancariaId,
        contraparteId: contraparte.id,
        motivo: `Transferência ${t.valor < 0 ? 'para' : 'de'} ${conta ? conta.nomeConta : 'outra conta sua'}`,
      };
    }

    if (t.valor < 0) {
      // --- pagamento que o app já tem (conta ou fatura marcada como paga)
      const jaPago = pagamentosFeitos.find(
        (m) =>
          !usados.has(`mov-${m.id}`) &&
          dentroDaTolerancia(valor, m.valor, TOLERANCIA_VALOR_CONTA_FIXA) &&
          dias(m.data, t.data) <= TOLERANCIA_DIAS_CONTA_FIXA
      );
      if (jaPago) {
        usados.add(`mov-${jaPago.id}`);
        return { tipo: 'ja_paga', existenteId: `mov-${jaPago.id}`, motivo: `Já marcado como pago: ${jaPago.descricao ?? 'pagamento'}` };
      }

      // --- conta fixa do mês
      const regraDeContaFixa = categorizacao?.acao === 'conta_fixa' ? categorizacao.contaFixaId : null;
      const candidatasFixas = contasFixas
        .filter((cf) => !usados.has(`parcela-${cf.parcelaId}`))
        .map((cf) => {
          const distancia = dias(cf.vencimento, t.data);
          if (regraDeContaFixa !== null) {
            return cf.conta.id === regraDeContaFixa && distancia <= 15 ? { cf, nota: distancia } : null;
          }
          if (!dentroDaTolerancia(valor, cf.valor, TOLERANCIA_VALOR_CONTA_FIXA) || distancia > TOLERANCIA_DIAS_CONTA_FIXA) return null;
          const parecido = semelhanca(cf.conta.nome, t.descricao);
          const mesmaCategoria = categorizacao?.categoriaId != null && categorizacao.categoriaId === cf.conta.categoriaId;
          const quaseIgual = Math.abs(valor - cf.valor) <= Math.round(cf.valor * 0.01);
          if (!quaseIgual && parecido < 0.4 && !mesmaCategoria) return null;
          return { cf, nota: Math.abs(valor - cf.valor) / Math.max(cf.valor, 1) + distancia / 30 - parecido };
        })
        .filter((c): c is { cf: ContaFixaAberta; nota: number } => c !== null)
        .sort((a, b) => a.nota - b.nota);
      const fixa = candidatasFixas[0]?.cf;
      if (fixa) {
        usados.add(`parcela-${fixa.parcelaId}`);
        return {
          tipo: 'conta_fixa',
          parcelaId: fixa.parcelaId,
          contaFixaId: fixa.conta.id,
          nome: fixa.conta.nome,
          categoriaId: fixa.conta.categoriaId,
          membroId: fixa.conta.membroId,
          motivo: `Conta fixa ${fixa.conta.nome} (vence ${formatarData(fixa.vencimento)})`,
        };
      }

      // --- pagamento de fatura: valor igual ao da fatura, ou texto de pagamento de fatura
      const textoDeFatura = PAGAMENTO_DE_FATURA.test(original);
      const bancoNoTexto = bancoPorTexto(original);
      const abertas = faturas.filter((f) => {
        if (f.paga || usados.has(`fatura-${f.cartao.id}-${f.mesReferencia}`)) return false;
        const distancia = differenceInCalendarDays(parseISO(t.data), parseISO(f.vencimento));
        return distancia >= -20 && distancia <= 10;
      });
      const mesmoValor = abertas.filter((f) => f.total === valor || f.pendente === valor);
      let fatura: FaturaAberta | undefined =
        mesmoValor.length > 0
          ? mesmoValor.sort((a, b) => dias(a.vencimento, t.data) - dias(b.vencimento, t.data))[0]
          : undefined;
      if (!fatura && textoDeFatura) {
        const doBanco = bancoNoTexto ? abertas.filter((f) => bancoPorTexto(f.cartao.nome) === bancoNoTexto) : [];
        const possiveis = doBanco.length > 0 ? doBanco : abertas.length === 1 ? abertas : [];
        fatura = possiveis.sort((a, b) => dias(a.vencimento, t.data) - dias(b.vencimento, t.data))[0];
      }
      if (fatura) {
        usados.add(`fatura-${fatura.cartao.id}-${fatura.mesReferencia}`);
        const diferente = fatura.total !== valor && fatura.pendente !== valor;
        return {
          tipo: 'fatura',
          fatura: {
            cartaoId: fatura.cartao.id,
            mesReferencia: fatura.mesReferencia,
            dataFechamento: dataFechamentoDaFatura(fatura.mesReferencia, fatura.cartao),
            dataVencimento: fatura.vencimento,
            parcelaIds: fatura.parcelaIds,
          },
          motivo: diferente
            ? `Pagamento da fatura ${fatura.cartao.nome} (no app ela está em ${formatarMoeda(fatura.total)})`
            : `Pagamento da fatura ${fatura.cartao.nome}`,
        };
      }
      if (textoDeFatura) {
        return { tipo: 'fatura', fatura: null, motivo: 'Pagamento de fatura de cartão (cartão fora do app)' };
      }

      // --- transferência própria sem o outro lado no app
      const propria = transferenciaSemContraparte('para');
      if (propria) return propria;
      return null;
    }

    // --- entradas
    // só no mesmo mês: a cópia mensal do salário é identificada pelo mês da data, e movê-la
    // para outro mês faria o app gerar outra cópia (salário em dobro)
    const prevista = receitasPrevistas
      .filter(
        (m) =>
          !usados.has(`mov-${m.id}`) &&
          m.data.slice(0, 7) === t.data.slice(0, 7) &&
          dentroDaTolerancia(valor, m.valor, 0.1) &&
          dias(m.data, t.data) <= 5
      )
      .sort((a, b) => dias(a.data, t.data) - dias(b.data, t.data))[0];
    if (prevista) {
      usados.add(`mov-${prevista.id}`);
      return { tipo: 'receita_prevista', movimentacaoId: prevista.id, motivo: `Confirma a entrada prevista: ${prevista.descricao ?? 'receita'}` };
    }

    // dinheiro que volta da poupança, da caixinha ou de outra conta sua: não é receita
    const propria = transferenciaSemContraparte('de');
    if (propria) return propria;

    if (valor >= VALOR_MINIMO_SALARIO && !categorizacao?.pessoaPix) {
      if (SALARIO.test(original)) return { tipo: 'salario', motivo: 'Salário' };
      // mesma fonte em pelo menos 2 outros meses (no extrato ou no app), com valor parecido
      const fonte = textoParaRegra(t.descricao);
      if (fonte !== '') {
        const mesesDaFonte = new Set<string>();
        const outras = [
          ...transacoes.filter((o) => o !== t && o.valor > 0).map((o) => ({ descricao: o.descricao, data: o.data, valor: o.valor })),
          ...entradasDaConta.map((m) => ({ descricao: m.descricao ?? '', data: m.data, valor: m.valor })),
        ];
        for (const outra of outras) {
          if (outra.data.slice(0, 7) === t.data.slice(0, 7)) continue;
          if (!dentroDaTolerancia(outra.valor, valor, 0.15)) continue;
          if (textoParaRegra(outra.descricao) !== fonte && semelhanca(outra.descricao, t.descricao) < 0.85) continue;
          mesesDaFonte.add(outra.data.slice(0, 7));
        }
        if (mesesDaFonte.size >= 2) {
          return { tipo: 'salario', motivo: `Entra todo mês (${mesesDaFonte.size + 1} meses)` };
        }
      }
    }
    return null;
  });
}
