import { semAcentos } from '@/domain/usecases/importacao/normalizarDescricao';
import { textoParaCentavos } from '@/core/utils/currency';
import type { LancamentoDoPeriodo } from '@/domain/types/lancamento';

export type FiltrosDaBusca = {
  texto: string;
  categoriaId?: number | null;
  inicio?: string | null;
  fim?: string | null;
};

/**
 * Busca em todos os lançamentos: o texto procura na descrição (sem acento, sem diferença de
 * maiúsculas, todas as palavras) e, se parecer um valor ("45,90", "R$ 45"), também pelo valor
 * exato. Filtra por categoria e período. Do mais recente para o mais antigo.
 */
export function buscarLancamentos(lancamentos: LancamentoDoPeriodo[], filtros: FiltrosDaBusca): LancamentoDoPeriodo[] {
  const texto = semAcentos(filtros.texto.trim());
  const palavras = texto.split(' ').filter(Boolean);
  const pareceValor = /^(R\$\s*)?[\d.]+(,\d{1,2})?$/.test(texto);
  const valor = pareceValor ? textoParaCentavos(texto.replace(/^R\$\s*/, '')) : NaN;

  return lancamentos
    .filter((l) => l.natureza !== 'fatura')
    .filter((l) => filtros.categoriaId == null || l.categoriaId === filtros.categoriaId)
    .filter((l) => !filtros.inicio || l.data >= filtros.inicio)
    .filter((l) => !filtros.fim || l.data <= filtros.fim)
    .filter((l) => {
      if (palavras.length === 0) return true;
      if (Number.isFinite(valor) && l.valor === valor) return true;
      const descricao = semAcentos(l.descricao);
      return palavras.every((p) => descricao.includes(p));
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}
