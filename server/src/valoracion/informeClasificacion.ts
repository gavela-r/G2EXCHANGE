import pool from '../../conexion/bd';
import fs from 'node:fs';
import path from 'node:path';
import { raizProyecto } from './rutas';
import { MAPEO_SECTORES } from './mapeoSectores';
import type {RowDataPacket} from 'mysql2/promise';
export async function informeClasificacion():Promise<void> {
  const dir=path.join(raizProyecto(),'server/resultados_valoraciones/verificacion');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'clasificacion_pendiente.jsonl');
  const stream=fs.createWriteStream(file);let cursor=0,total=0,pending=0;const reasons:Record<string,number>={};
  try{while(true){const [rows]=await pool.query<RowDataPacket[]>('SELECT e.id,e.nombre_empresa,e.sector_id,s.nombre_sector FROM empresa e LEFT JOIN sector s ON s.id=e.sector_id WHERE e.id>? ORDER BY e.id LIMIT 500',[cursor]);if(!rows.length)break;for(const r of rows){const m=MAPEO_SECTORES[r.sector_id];const reason=!m?'SIN_MAPEO':m.clasificacion==='REVISAR'?'REQUIERE_EVIDENCIA':m.nombre.toLowerCase()!==String(r.nombre_sector).toLowerCase()?'MAPEO_INCONSISTENTE':undefined;if(reason){pending++;reasons[reason]=(reasons[reason]??0)+1;if(!stream.write(JSON.stringify({...r,reason})+'\n'))await new Promise<void>(resolve=>stream.once('drain',resolve));}total++;cursor=r.id;}}}finally{await new Promise<void>((resolve,reject)=>{stream.on('error',reject);stream.end(resolve);});}
  fs.writeFileSync(path.join(dir,'clasificacion_resumen.json'),JSON.stringify({total,pending,reasons,scope:'Clasificación suficiente no garantiza elegibilidad financiera'},null,2));
}
if(require.main===module)informeClasificacion().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
