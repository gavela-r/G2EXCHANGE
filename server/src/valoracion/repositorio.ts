import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { ModeloInput, Resultado } from 'g2-motor/tipos';
import { Preparado, serializar, validarResultado } from './datos';
import { crearSnapshotCompleto } from '../../insercionDatos/insercionaDatosValuationInputSnapshotCompleto';
export async function comprobarEsquema(c:PoolConnection):Promise<void> {
  const [cols]=await c.query<RowDataPacket[]>('SHOW COLUMNS FROM valuation_execution');
  for(const col of ['input_hash','instrumento_id','input_json','trace_json','output_json','financial_state','engine_version','manifest_hash'])if(!cols.some(x=>x.Field===col))throw new Error(`Migración pendiente: valuation_execution.${col}`);
  for(const col of ['input_json','trace_json','output_json'])if(!cols.some(x=>x.Field===col&&String(x.Type).toLowerCase()==='longtext'))throw new Error(`Migración pendiente: ${col} requiere LONGTEXT validado para conservar precisión exacta`);
}
export async function guardarResultados(c:PoolConnection,runId:number,input:ModeloInput,result:Resultado):Promise<string> {
  const state=validarResultado(input,result);
  const [run]=await c.query<RowDataPacket[]>('SELECT empresa_id,input_snapshot_id,estado FROM valuation_run WHERE id=? FOR UPDATE',[runId]);
  if(run.length!==1||Number(run[0].empresa_id)!==Number(input.company_id)||Number(run[0].input_snapshot_id)!==Number(input.input_snapshot_id)||run[0].estado!=='EJECUTANDO')throw new Error('RUN no ejecutando o identidad inconsistente');
  const [existing]=await c.query<RowDataPacket[]>('SELECT id FROM valuation_run_resultado WHERE valuation_run_id=?',[runId]);
  if(existing.length)throw new Error('Resultados existentes inmutables');
  // fair_value NOT NULL: blocked executions have evidence, never a fabricated zero.
  if(state!=='BLOQUEADA')for(const v of result.valuations)await c.query(`INSERT INTO valuation_run_resultado (valuation_run_id,escenario,fair_value,max_buy_price,current_price,upside,wacc,terminal_growth,decision,confidence,validation_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[runId,v.escenario,v.fair_value,v.max_buy_price,input.price_per_share,v.upside,v.wacc,v.terminal_growth,v.decision,input.confidence??'LOW',result.validation_status]);
  return state;
}
export interface Persistido {runId:number;snapshotId:number;reused:boolean;financialState:string;result?:Resultado;}
export async function persistirEnConexion(c:PoolConnection,p:Preparado,motor:(i:ModeloInput)=>Resultado,revalidate=false):Promise<Persistido> {
  await comprobarEsquema(c);await c.beginTransaction();
  try {
    const [old]=await c.query<RowDataPacket[]>('SELECT ve.*,vr.input_snapshot_id,vr.estado FROM valuation_execution ve JOIN valuation_run vr ON vr.id=ve.valuation_run_id WHERE ve.input_hash=? FOR UPDATE',[p.hash]);
    if(old.length){
      if(old[0].estado!=='COMPLETADO')throw new Error('Ejecución equivalente incompleta');
      if(revalidate){const input=typeof old[0].input_json==='string'?JSON.parse(old[0].input_json):old[0].input_json,output=typeof old[0].output_json==='string'?JSON.parse(old[0].output_json):old[0].output_json;const repeated=motor(input);validarResultado(input,repeated);if(serializar(repeated)!==serializar(output))throw new Error('Replay difiere del histórico: no sobrescribir');}
      await c.commit();return {runId:Number(old[0].valuation_run_id),snapshotId:Number(old[0].input_snapshot_id),reused:true,financialState:old[0].financial_state};
    }
    const [models]=await c.query<RowDataPacket[]>('SELECT id FROM model_version WHERE version=?',[p.engineVersion]);
    if(models.length!==1)throw new Error(`Versión real ${p.engineVersion}: registrar exactamente una model_version; no reutilizar 1.2`);
    const i=p.input;
    const snapshotId=await crearSnapshotCompleto(c,p);
    const [run]=await c.query<ResultSetHeader>(`INSERT INTO valuation_run (empresa_id,input_snapshot_id,model_version_id,template_code,valuation_method_family,estado,engine_version,fecha_inicio) VALUES (?,?,?,?,?,'EJECUTANDO',?,NOW())`,[i.company_id,snapshotId,models[0].id,i.template_code,p.trace.family,p.engineVersion]);
    const frozen={...i,valuation_run_id:run.insertId,input_snapshot_id:snapshotId};const result=motor(frozen);const state=await guardarResultados(c,run.insertId,frozen,result);
    await c.query(`INSERT INTO valuation_execution (valuation_run_id,input_hash,instrumento_id,input_json,trace_json,output_json,financial_state,engine_version,manifest_hash) VALUES (?,?,?,?,?,?,?,?,?)`,[run.insertId,p.hash,p.instrumento.instrumento_id,serializar(frozen),serializar(p.trace),serializar(result),state,p.engineVersion,p.manifestHash]);
    await c.query("UPDATE valuation_run SET estado='COMPLETADO',fecha_fin=NOW(),error_mensaje=? WHERE id=? AND estado='EJECUTANDO'",[state==='BLOQUEADA'?'DATA_PENDING: consultar valuation_execution.output_json':null,run.insertId]);
    await c.commit();return {runId:run.insertId,snapshotId:snapshotId,reused:false,financialState:state,result};
  }catch(e){await c.rollback();throw e;}
}
export async function conBloqueoInstrumento<T>(pool:Pool,id:number,fn:(c:PoolConnection)=>Promise<T>):Promise<T> {
  const c=await pool.getConnection(),lock=`g2_valoracion_instrumento_${id}`;let acquired=false;
  try{const [r]=await c.query<RowDataPacket[]>('SELECT GET_LOCK(?,10) ok',[lock]);acquired=Number(r[0].ok)===1;if(!acquired)throw Object.assign(new Error('Instrumento ocupado'),{code:'ER_LOCK_WAIT_TIMEOUT'});return await fn(c);}
  finally{try{if(acquired)await c.query('SELECT RELEASE_LOCK(?)',[lock]);}finally{c.release();}}
}
