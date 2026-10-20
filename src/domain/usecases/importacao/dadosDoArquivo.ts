import { semAcentos } from './normalizarDescricao';
import type { BancoId, DadosDaConta, ExtratoLido } from './tipos';

/**
 * Dados do cabeçalho do extrato, além dos lançamentos: de quem é a conta (para reconhecer PIX
 * para si mesmo), qual conta é (agência/número, corrente ou poupança: liga os próximos arquivos
 * à mesma conta do app) e o saldo antes do primeiro lançamento.
 */

const NOME = "[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.' ]{2,80}";

/** "Cliente: FULANO DE TAL", "Titular;FULANO", "Nome do cliente - FULANO" nas primeiras linhas. */
export function titularDoTexto(linhas: string[]): string | null {
  const padrao = new RegExp(`^\\s*(cliente|titular|nome do cliente|nome do titular|correntista|nome)\\s*(?:[;,-]|:)(?:\\s|[;,-])*(?:\\d[\\d.]*\\s+)?(${NOME})`, 'i');
  for (const bruta of linhas.slice(0, 40)) {
    const achado = bruta.replace(/"/g, '').match(padrao);
    if (!achado) continue;
    const nome = achado[2].replace(/\s+/g, ' ').trim();
    if (nome.split(' ').length >= 2) return nome;
  }
  return null;
}

/** Agência, número e tipo da conta, pelo cabeçalho e pelo nome do arquivo. */
export function contaDoTexto(linhas: string[], nomeArquivo: string): DadosDaConta | null {
  const texto = semAcentos(linhas.slice(0, 40).join('\n'));
  const agencia = texto.match(/AGENCIA\s*:?\s*(\d{3,5}(?:-?[\dX])?)/)?.[1] ?? null;
  const numero = texto.match(/\bCONTA(?: CORRENTE| POUPANCA)?\s*:?\s*(\d[\d.]{2,14}-?[\dX]?)/)?.[1] ?? null;
  const nome = semAcentos(nomeArquivo);
  const tipo = /POUPANCA|\bPOUP\b|EXTRATO DE POUPANCA|CONTA POUPANCA/.test(`${texto}\n${nome}`)
    ? 'poupanca'
    : /CONTA CORRENTE|EXTRATO DE CONTA|\bCORRENTE\b/.test(`${texto}\n${nome}`)
      ? 'corrente'
      : null;
  if (!agencia && !numero && !tipo) return null;
  return { agencia, numero: numero ? numero.replace(/\./g, '') : null, tipo };
}

/** Chave que liga o arquivo a uma conta do app ("bb|1234-5|99887-6|corrente"). Null sem número de conta. */
export function identificadorDoExtrato(extrato: Pick<ExtratoLido, 'banco' | 'conta'>): string | null {
  const conta = extrato.conta;
  if (!conta?.numero) return null;
  const limpar = (v: string | null) => (v ?? '').replace(/[^\dX]/gi, '').replace(/^0+/, '');
  return [extrato.banco ?? 'outro', limpar(conta.agencia), limpar(conta.numero), conta.tipo ?? ''].join('|');
}

/** Nome para a conta criada sozinha na importação ("BB · Poupança"). */
export function nomeDaContaNova(banco: BancoId | null, nomeDoBanco: string, conta: DadosDaConta | null | undefined): string {
  const tipo = conta?.tipo === 'poupanca' ? 'Poupança' : 'Conta corrente';
  const final = conta?.numero ? ` ${conta.numero.replace(/-.*/, '').slice(-4)}` : '';
  return `${banco ? nomeDoBanco : 'Conta'} · ${tipo}${final}`;
}
