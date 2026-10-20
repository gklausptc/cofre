import type { MapeamentoColunas } from './lerExtrato';
import type { BancoId, OrigemExtrato } from './tipos';

/**
 * Formatos de CSV conhecidos, por banco. Os nomes de coluna estão normalizados
 * (`normalizarCabecalho`: minúsculas, sem acentos, sem pontuação). Um layout é reconhecido
 * quando todas as colunas de `exige` estão no cabeçalho; vale o que exigir mais colunas.
 * CSV de banco fora desta lista ainda é lido pela detecção genérica de colunas (ou pelo
 * mapeamento manual), só não ganha banco e origem automáticos.
 */
type Layout = {
  id: string;
  banco: BancoId;
  origem: OrigemExtrato;
  exige: string[];
  colunas: {
    data: string;
    descricao: string[];
    valor?: string;
    debito?: string;
    credito?: string;
    tipo?: string;
    parcela?: string;
    identificador?: string;
    categoria?: string;
  };
  /** Compra vem negativa no arquivo (o app usa compra positiva). */
  inverterSinal?: boolean;
  /** Repete o cabeçalho e lançamentos já listados (bloco "Últimos Lançamentos"). */
  blocoRepetido?: boolean;
  /** O cabeçalho precisa ter só essas colunas (para layouts com nomes muito comuns). */
  exato?: boolean;
};

/**
 * Fontes: pesquisa de out/2026 com arquivos reais publicados (ver docs/importacao-bancos.md).
 * Santander (só PDF desde 2026), fatura do PicPay (só PDF) e InfinitePay (formato não
 * encontrado) não têm layout: OFX e a detecção genérica de colunas cobrem o que existir.
 */
export const LAYOUTS: Layout[] = [
  {
    id: 'nubank-conta',
    banco: 'nubank',
    origem: 'conta',
    exige: ['data', 'valor', 'identificador', 'descricao'],
    colunas: { data: 'data', descricao: ['descricao'], valor: 'valor', identificador: 'identificador' },
  },
  {
    id: 'nubank-cartao',
    banco: 'nubank',
    origem: 'cartao',
    exige: ['date', 'title', 'amount'],
    colunas: { data: 'date', descricao: ['title'], valor: 'amount', categoria: 'category' },
  },
  {
    id: 'c6-cartao',
    banco: 'c6',
    origem: 'cartao',
    exige: ['data de compra', 'final do cartao', 'descricao', 'parcela', 'valor em r$'],
    colunas: {
      data: 'data de compra',
      descricao: ['descricao'],
      valor: 'valor em r$',
      parcela: 'parcela',
      categoria: 'categoria',
    },
  },
  {
    id: 'c6-conta',
    banco: 'c6',
    origem: 'conta',
    exige: ['data lancamento', 'data contabil', 'titulo', 'descricao', 'entrada r$', 'saida r$'],
    colunas: { data: 'data lancamento', descricao: ['titulo', 'descricao'], credito: 'entrada r$', debito: 'saida r$' },
  },
  {
    id: 'bb-conta',
    banco: 'bb',
    origem: 'conta',
    exige: ['data', 'lancamento', 'detalhes', 'valor', 'tipo lancamento'],
    colunas: { data: 'data', descricao: ['lancamento', 'detalhes'], valor: 'valor', tipo: 'tipo lancamento' },
  },
  {
    // layout usado até ~2024 (arquivos antigos guardados)
    id: 'bb-conta-antigo',
    banco: 'bb',
    origem: 'conta',
    exige: ['data', 'dependencia origem', 'historico', 'data do balancete', 'valor'],
    colunas: { data: 'data', descricao: ['historico'], valor: 'valor' },
  },
  {
    id: 'bradesco-conta',
    banco: 'bradesco',
    origem: 'conta',
    exige: ['data', 'historico', 'credito r$', 'debito r$'],
    colunas: { data: 'data', descricao: ['historico'], credito: 'credito r$', debito: 'debito r$' },
    blocoRepetido: true,
  },
  {
    // datas "dd/mm" sem ano: o ano vem da primeira linha ("Data: 10/01/2026 …")
    id: 'bradesco-cartao',
    banco: 'bradesco',
    origem: 'cartao',
    exige: ['data', 'historico', 'valor us$', 'valor r$'],
    colunas: { data: 'data', descricao: ['historico'], valor: 'valor r$' },
  },
  {
    id: 'itau-cartao',
    banco: 'itau',
    origem: 'cartao',
    exige: ['data', 'lancamento', 'valor'],
    colunas: { data: 'data', descricao: ['lancamento'], valor: 'valor' },
    exato: true,
  },
  {
    id: 'picpay-conta',
    banco: 'picpay',
    origem: 'conta',
    exige: ['data', 'hora', 'tipo', 'origem / destino', 'valor'],
    colunas: { data: 'data', descricao: ['tipo', 'origem / destino'], valor: 'valor' },
  },
];

export type LayoutReconhecido = {
  id: string;
  banco: BancoId;
  origem: OrigemExtrato;
  inverterSinal?: boolean;
  blocoRepetido?: boolean;
  mapear: (cabecalho: string[]) => MapeamentoColunas | null;
};

export function reconhecerLayout(cabecalhoNormalizado: string[]): LayoutReconhecido | null {
  const presentes = new Set(cabecalhoNormalizado);
  const preenchidas = cabecalhoNormalizado.filter((c) => c !== '').length;
  const candidatos = LAYOUTS.filter(
    (l) => l.exige.every((coluna) => presentes.has(coluna)) && (!l.exato || preenchidas === l.exige.length)
  ).sort(
    (a, b) => b.exige.length - a.exige.length
  );
  const layout = candidatos[0];
  if (!layout) return null;

  return {
    id: layout.id,
    banco: layout.banco,
    origem: layout.origem,
    inverterSinal: layout.inverterSinal,
    blocoRepetido: layout.blocoRepetido,
    mapear: (cabecalho) => {
      const indice = (nome: string | undefined) => {
        if (nome === undefined) return undefined;
        const i = cabecalho.indexOf(nome);
        return i >= 0 ? i : undefined;
      };
      const data = indice(layout.colunas.data);
      const descricao = layout.colunas.descricao.map(indice).filter((i): i is number => i !== undefined);
      if (data === undefined || descricao.length === 0) return null;
      return {
        data,
        descricao,
        valor: indice(layout.colunas.valor),
        debito: indice(layout.colunas.debito),
        credito: indice(layout.colunas.credito),
        tipo: indice(layout.colunas.tipo),
        parcela: indice(layout.colunas.parcela),
        identificador: indice(layout.colunas.identificador),
        categoria: indice(layout.colunas.categoria),
      };
    },
  };
}
