/**
 * Raiz de composição do app: o único lugar fora de `src/data/` que conhece as
 * implementações concretas. O `app/_layout.tsx` chama `inicializarRepositorios()` uma vez
 * e, dali em diante, telas e stores só falam com as interfaces de `src/domain/repositories`.
 */
import { backupRepositorySqlite } from '@/data/backup/backupSqlite';
import { aportesCofrinhoRepositorySqlite } from '@/data/repositories/aportesCofrinhoRepository';
import { cartoesRepositorySqlite } from '@/data/repositories/cartoesRepository';
import { categoriasRepositorySqlite } from '@/data/repositories/categoriasRepository';
import { cofrinhosRepositorySqlite } from '@/data/repositories/cofrinhosRepository';
import { comprasParceladasRepositorySqlite } from '@/data/repositories/comprasParceladasRepository';
import { contasBancariasRepositorySqlite } from '@/data/repositories/contasBancariasRepository';
import { contasFixasRepositorySqlite } from '@/data/repositories/contasFixasRepository';
import { faturasRepositorySqlite } from '@/data/repositories/faturasRepository';
import { gastosRapidosRepositorySqlite } from '@/data/repositories/gastosRapidosRepository';
import { manutencaoRepositorySqlite } from '@/data/repositories/manutencaoRepository';
import { membrosFamiliaRepositorySqlite } from '@/data/repositories/membrosFamiliaRepository';
import { movimentacoesRepositorySqlite } from '@/data/repositories/movimentacoesRepository';
import { movimentacoesReservaRepositorySqlite } from '@/data/repositories/movimentacoesReservaRepository';
import { parcelasRepositorySqlite } from '@/data/repositories/parcelasRepository';
import { preferenciasRepositorySqlite } from '@/data/repositories/preferenciasRepository';
import { reservaEmergenciaRepositorySqlite } from '@/data/repositories/reservaEmergenciaRepository';
import { registrarRepositorios } from '@/domain/repositories';

export { prepararBanco } from '@/data/db/prepararBanco';
export { agendarLembretesDoDia, prepararDadosDoDia } from './rotinasDeAbertura';

export function inicializarRepositorios(): void {
  registrarRepositorios({
    aportesCofrinho: aportesCofrinhoRepositorySqlite,
    backup: backupRepositorySqlite,
    cartoes: cartoesRepositorySqlite,
    categorias: categoriasRepositorySqlite,
    cofrinhos: cofrinhosRepositorySqlite,
    comprasParceladas: comprasParceladasRepositorySqlite,
    contasBancarias: contasBancariasRepositorySqlite,
    contasFixas: contasFixasRepositorySqlite,
    faturas: faturasRepositorySqlite,
    gastosRapidos: gastosRapidosRepositorySqlite,
    manutencao: manutencaoRepositorySqlite,
    membrosFamilia: membrosFamiliaRepositorySqlite,
    movimentacoes: movimentacoesRepositorySqlite,
    movimentacoesReserva: movimentacoesReservaRepositorySqlite,
    parcelas: parcelasRepositorySqlite,
    preferencias: preferenciasRepositorySqlite,
    reservaEmergencia: reservaEmergenciaRepositorySqlite,
  });
}
