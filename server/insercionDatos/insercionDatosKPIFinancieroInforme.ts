/** Compatibility entrypoint: delega en el escritor único kpiSincronizarInforme (reglas vigentes). No writes on import. */
import type { Pool } from 'mysql2/promise';
import { kpiSincronizarInforme } from './insercionKPIInformeFinanciero';
export async function calcularYGuardarKpis(pool:Pool,informeId:number):Promise<void> {
 const connection=await pool.getConnection();
 try { await connection.beginTransaction(); await kpiSincronizarInforme(connection as any,informeId,true); await connection.commit(); }
 catch(error) { await connection.rollback(); throw error; }
 finally { connection.release(); }
}
