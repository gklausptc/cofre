import type { BancoId } from '@/domain/usecases/importacao/tipos';

/**
 * Como tirar o extrato e a fatura de cada banco (pesquisa de out/2026 e arquivos enviados pelo
 * usuário). Texto curto para o guia da tela de importação. PDF gerado pelo banco também é lido
 * (com senha, se tiver); PDF escaneado (foto) não.
 */
export const COMO_EXPORTAR: { banco: BancoId; conta: string; cartao: string }[] = [
  {
    banco: 'bb',
    conta: 'App: Extrato → Baixar extrato → PDF, CSV ou OFX. Corrente e poupança vêm em arquivos separados.',
    cartao: 'Ourocard: no site, salve a fatura em TXT ou OFX.',
  },
  {
    banco: 'c6',
    conta: 'App: extrato em PDF. Pelo Web Banking (computador): CSV ou OFX.',
    cartao: 'App: Baixar fatura → CSV ou PDF → "Baixar e salvar no celular". O PDF tem senha (a mesma do e-mail da fatura).',
  },
  {
    banco: 'picpay',
    conta: 'App: Ver extrato → Baixar extrato → CSV (chega por e-mail; salve em Arquivos).',
    cartao: 'A fatura do PicPay só sai em PDF: importe o PDF.',
  },
  {
    banco: 'nubank',
    conta: 'App: Pedir extrato → CSV ou OFX (chega por e-mail).',
    cartao: 'Fatura fechada → compartilhar → CSV ou OFX.',
  },
  {
    banco: 'itau',
    conta: 'Site: Extrato → Salvar em outros formatos → OFX ou TXT.',
    cartao: 'Fatura → Salvar planilha (CSV). Não existe OFX de fatura.',
  },
  {
    banco: 'bradesco',
    conta: 'Site: Salvar como arquivo → CSV ou OFX.',
    cartao: 'Site: fatura em TXT ou OFX (no app só sai PDF).',
  },
  {
    banco: 'santander',
    conta: 'Desde 2026 o Santander só entrega o extrato em PDF: importe o PDF.',
    cartao: 'A fatura também só sai em PDF: importe o PDF.',
  },
  {
    banco: 'infinitepay',
    conta: 'App: toque no saldo → Filtros → download → CSV ou OFX.',
    cartao: 'Formato da fatura ainda não confirmado: tente CSV ou OFX.',
  },
];
