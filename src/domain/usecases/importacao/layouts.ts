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
  };
  /** Compra vem negativa no arquivo (o app usa compra positiva). */
  inverterSinal?: boolean;
};

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
    colunas: { data: 'date', descricao: ['title'], valor: 'amount' },
  },
  {
    id: 'c6-cartao',
    banco: 'c6',
    origem: 'cartao',
    exige: ['data de compra', 'final do cartao', 'descricao', 'parcela', 'valor em r$'],
    colunas: { data: 'data de compra', descricao: ['descricao'], valor: 'valor em r$', parcela: 'parcela' },
  },
  {
    id: 'bb-conta',
    banco: 'bb',
    origem: 'conta',
    exige: ['data', 'lancamento', 'detalhes', 'valor', 'tipo lancamento'],
    colunas: { data: 'data', descricao: ['lancamento', 'detalhes'], valor: 'valor', tipo: 'tipo lancamento' },
  },
  {
    id: 'bradesco-conta',
    banco: 'bradesco',
    origem: 'conta',
    exige: ['data', 'historico', 'credito r$', 'debito r$'],
    colunas: { data: 'data', descricao: ['historico'], credito: 'credito r$', debito: 'debito r$' },
  },
];

export type LayoutReconhecido = {
  id: string;
  banco: BancoId;
  origem: OrigemExtrato;
  inverterSinal?: boolean;
  mapear: (cabecalho: string[]) => MapeamentoColunas | null;
};

export function reconhecerLayout(cabecalhoNormalizado: string[]): LayoutReconhecido | null {
  const presentes = new Set(cabecalhoNormalizado);
  const candidatos = LAYOUTS.filter((l) => l.exige.every((coluna) => presentes.has(coluna))).sort(
    (a, b) => b.exige.length - a.exige.length
  );
  const layout = candidatos[0];
  if (!layout) return null;

  return {
    id: layout.id,
    banco: layout.banco,
    origem: layout.origem,
    inverterSinal: layout.inverterSinal,
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
      };
    },
  };
}
