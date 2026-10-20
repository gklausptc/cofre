import type { BancoId } from '@/domain/usecases/importacao/tipos';

/**
 * Como tirar o extrato e a fatura em CSV/OFX de cada banco (pesquisa de out/2026 e telas
 * enviadas pelo usuário). Texto curto para o guia da tela de importação.
 */
export const COMO_EXPORTAR: { banco: BancoId; conta: string; cartao: string }[] = [
  {
    banco: 'bb',
    conta: 'App: Extrato → Baixar extrato → CSV (ou OFX).',
    cartao: 'Ourocard: no site, salve a fatura em TXT ou OFX.',
  },
  {
    banco: 'c6',
    conta: 'Pelo Web Banking (computador): CSV ou OFX. O app só gera PDF.',
    cartao: 'App: Baixar fatura → CSV → "Baixar e salvar no celular" (por e-mail pode vir em .zip com senha).',
  },
  {
    banco: 'picpay',
    conta: 'App: Ver extrato → Baixar extrato → CSV (chega por e-mail; salve em Arquivos).',
    cartao: 'A fatura do PicPay só sai em PDF: ainda não dá para importar.',
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
    conta: 'Desde 2026 o Santander só entrega o extrato em PDF: ainda não dá para importar.',
    cartao: 'A fatura também só sai em PDF.',
  },
  {
    banco: 'infinitepay',
    conta: 'App: toque no saldo → Filtros → download → CSV ou OFX.',
    cartao: 'Formato da fatura ainda não confirmado: tente CSV ou OFX.',
  },
];
