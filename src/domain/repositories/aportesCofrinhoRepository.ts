import type { AporteCofrinho } from '@/domain/types/entities';

export interface AportesCofrinhoRepository {
  listarAportes(): Promise<AporteCofrinho[]>;
  listarAportesPorCofrinho(cofrinhoId: number): Promise<AporteCofrinho[]>;
  criarAporte(cofrinhoId: number, valor: number, data: string): Promise<AporteCofrinho>;
  /** Para o "Desfazer" logo depois de guardar. */
  excluirAporte(id: number): Promise<void>;
}
