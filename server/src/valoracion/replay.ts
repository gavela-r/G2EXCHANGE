import pool from '../../conexion/bd';
import { obtenerAdaptadorMySQL } from './motorServicio';
import { cargarMotorHistorico } from './rutas';
import { serializar, validarResultado } from './datos';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
/** Read-only replay, including archived code. Never writes historical results. */
export async function reproducirRun(c:PoolConnection,id:number) {
  const input=await obtenerAdaptadorMySQL().exportarInputDesdeRun(c,id);
  const [rows]=await c.query<RowDataPacket[]>('SELECT engine_version,manifest_hash,output_json FROM valuation_execution WHERE valuation_run_id=?',[id]);
  if(rows.length!==1)throw new Error('Ejecución congelada inexistente');
  const r=rows[0],stored=typeof r.output_json==='string'?JSON.parse(r.output_json):r.output_json;
  const result=cargarMotorHistorico(r.manifest_hash,r.engine_version).valorar(input);
  validarResultado(input,result);
  if(serializar(result)!==serializar(stored))throw new Error('Replay difiere del histórico; no sobrescribir');
  return {reproduced:true,run_id:id,engine_version:r.engine_version,manifest_hash:r.manifest_hash,resultado:result};
}
if(require.main===module) {
  const id=Number(process.argv[2]);
  (async()=>{try{
    if(process.argv.length!==3||!Number.isSafeInteger(id)||id<=0)throw new Error('Uso: valuation:replay -- <run_id>');
    const c=await pool.getConnection();
    try{await c.query('START TRANSACTION READ ONLY');console.log(JSON.stringify(await reproducirRun(c,id)));}finally{await c.rollback();c.release();}
  }finally{await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
}
