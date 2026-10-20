import type { Preferencias, PreferenciasAtualizaveis } from '@/domain/types/entities';

export interface PreferenciasRepository {
  /** Linha singleton; é criada com os valores padrão se ainda não existir. */
  buscarPreferencias(): Promise<Preferencias>;
  atualizarPreferencias(dados: PreferenciasAtualizaveis): Promise<Preferencias>;
}
