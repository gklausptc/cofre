import type { AportesCofrinhoRepository } from './aportesCofrinhoRepository';
import type { BackupRepository } from './backupRepository';
import type { CartoesRepository } from './cartoesRepository';
import type { CategoriasRepository } from './categoriasRepository';
import type { CofrinhosRepository } from './cofrinhosRepository';
import type { ComprasParceladasRepository } from './comprasParceladasRepository';
import type { ContasBancariasRepository } from './contasBancariasRepository';
import type { ContasFixasRepository } from './contasFixasRepository';
import type { FaturasRepository } from './faturasRepository';
import type { GastosRapidosRepository } from './gastosRapidosRepository';
import type { ImportacoesRepository } from './importacoesRepository';
import type { ManutencaoRepository } from './manutencaoRepository';
import type { MembrosFamiliaRepository } from './membrosFamiliaRepository';
import type { MovimentacoesRepository } from './movimentacoesRepository';
import type { MovimentacoesReservaRepository } from './movimentacoesReservaRepository';
import type { ParcelasRepository } from './parcelasRepository';
import type { PerguntasRepository } from './perguntasRepository';
import type { PreferenciasRepository } from './preferenciasRepository';
import type { RegrasRepository } from './regrasRepository';
import type { ReservaEmergenciaRepository } from './reservaEmergenciaRepository';

/**
 * Contratos de acesso a dados que a apresentação (telas, stores) e os serviços usam.
 * As implementações concretas (SQLite/Drizzle, em `src/data/`) são registradas uma vez,
 * na inicialização do app (`src/core/inicializacao`) — assim ninguém fora dali precisa
 * importar `src/data/`, e trocar o armazenamento não exige mexer nas telas.
 */
export type Repositorios = {
  aportesCofrinho: AportesCofrinhoRepository;
  backup: BackupRepository;
  cartoes: CartoesRepository;
  categorias: CategoriasRepository;
  cofrinhos: CofrinhosRepository;
  comprasParceladas: ComprasParceladasRepository;
  contasBancarias: ContasBancariasRepository;
  contasFixas: ContasFixasRepository;
  faturas: FaturasRepository;
  gastosRapidos: GastosRapidosRepository;
  importacoes: ImportacoesRepository;
  manutencao: ManutencaoRepository;
  membrosFamilia: MembrosFamiliaRepository;
  movimentacoes: MovimentacoesRepository;
  movimentacoesReserva: MovimentacoesReservaRepository;
  parcelas: ParcelasRepository;
  perguntas: PerguntasRepository;
  preferencias: PreferenciasRepository;
  regras: RegrasRepository;
  reservaEmergencia: ReservaEmergenciaRepository;
};

let registrados: Repositorios | null = null;

export function registrarRepositorios(implementacoes: Repositorios): void {
  registrados = implementacoes;
}

export function repositorios(): Repositorios {
  if (registrados === null) {
    throw new Error('Repositórios não registrados: chame inicializarRepositorios() na inicialização do app.');
  }
  return registrados;
}
