/** Compatibility entrypoint; uses standard taxonomies and actual kpi column. No writes on import. */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { normalizarPartidas } from '../src/valoracion/datos';
import { kpiCalcularInforme } from './insercionKPIInformeFinanciero';
export async function calcularYGuardarKpis(pool:Pool,informeId:number):Promise<void> {
 const [meta]=await pool.query<RowDataPacket[]>('SELECT fuente FROM informe_financiero WHERE id=?',[informeId]);
 if(meta.length!==1)throw new Error('Informe inexistente');
 const [rows]=await pool.query<RowDataPacket[]>(`SELECT pc.concepto,pc.importe,tc.concepto_estandar,tc.signo_esperado,tc.alias_sec,tc.alias_edinet,tc.alias_finmind FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id=?`,[informeId]);
 const partidas=normalizarPartidas(rows as any,meta[0].fuente).valores;
 const connection=await pool.getConnection();
 try {
  await connection.beginTransaction();
  for(const k of kpiCalcularInforme(informeId,partidas)) {
     await connection.query(`INSERT INTO kpi_financiero_informe (informe_id,kpi,valor,unidad,nivel_confianza,fecha_calculo)
        VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE valor=VALUES(valor),unidad=VALUES(unidad),nivel_confianza=VALUES(nivel_confianza),fecha_calculo=CURRENT_TIMESTAMP`,[k.informeId,k.kpi,k.valor,k.unidad,k.nivelConfianza]);
  }
  await connection.commit();
 } catch(error) {
  await connection.rollback();
  throw error;
 } finally {
  connection.release();
 }
}
