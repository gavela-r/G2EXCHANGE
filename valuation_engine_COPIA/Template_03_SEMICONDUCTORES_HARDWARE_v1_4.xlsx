/**
 * Writes explicitly APPROVED WACC params only after human-controlled DB migration.
 * Never called by CLI or auto imported by server. Persist does NOT update valuation_run_resultado.
 */
import type { Pool,RowDataPacket } from 'mysql2/promise';
import type { Resultado } from '../tipos';
export async function persistirParametrosAprobados(pool:Pool,resultado:Resultado,autorizar:boolean=false):Promise<void>{
  if(!autorizar)throw new Error('Escritura bloqueada por defecto');
  if(resultado.premium_methodology!=='MANUAL_APPROVED'||resultado.validation_status!=='REVIEW') throw new Error('Primas DRAFT o valoración bloqueada: no persistir');
  const runId=Number(resultado.valuation_run_id);
  if(!Number.isSafeInteger(runId)||runId<=0)throw new Error('RUN ID numérico obligatorio');
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [run]=await conn.query<RowDataPacket[]>(`SELECT id FROM valuation_run WHERE id=? AND input_snapshot_id=? AND estado='PREPARANDO' FOR UPDATE`,[runId,resultado.input_snapshot_id]);
    if(run.length!==1)throw new Error('RUN no en PREPARANDO o snapshot no coincide');
    const [count]=await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM valuation_run_parametros WHERE valuation_run_id=?`,[runId]);
    if(Number(count[0].n)!==0)throw new Error('Parámetros ya congelados: operación bloqueada');
    const [cols]=await conn.query<RowDataPacket[]>('SHOW COLUMNS FROM valuation_run_parametros');
    const fields=new Set(cols.map((x)=>String(x.Field)));
    for(const col of ['prima_tamano','otros_ajustes_wacc','auditoria_ajustes_json']) if(!fields.has(col))throw new Error(`Falta columna ${col}; revisar sql/03_MIGRACION_OPCIONAL_REVISION.sql`);
    for(const w of resultado.wacc_scenarios){
      const a=w.ajustes;
      await conn.execute(`INSERT INTO valuation_run_parametros (
       valuation_run_id,escenario,ke,rf,beta,equity_risk_premium,spread_credito,kd,peso_patrimonio,
       peso_deuda,tasa_impositiva,wacc_base,prima_iliquidez,prima_tamano,prima_concentracion_clientes,
       otros_ajustes_wacc,wacc_ajustado,auditoria_ajustes_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
       runId,w.escenario,w.ke,w.rf,w.beta,w.erp,w.spread_credito,w.kd,w.peso_patrimonio,w.peso_deuda,
       w.impuesto,w.wacc_financiero,a.prima_iliquidez.value,a.prima_tamano.value,
       a.prima_concentracion_clientes.value,a.otros_ajustes_wacc.value,w.wacc_ajustado,JSON.stringify(a)]);
    }
    await conn.commit();
  }catch(err){await conn.rollback();throw err;}finally{conn.release();}
}
