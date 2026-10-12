import type { Pool, RowDataPacket } from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { cargarMotor, raizProyecto,manifiestoMotor } from './rutas';
import { prepararInstrumento, Pendiente, HipotesisInstrumento, validarResultado, huella } from './datos';
import { comprobarEsquema, conBloqueoInstrumento, persistirEnConexion } from './repositorio';
export interface OpcionesLote {mode:'full'|'incremental';dryRun:boolean;resume:boolean;batchSize:number;limit?:number;instrumentId?:number;asOf:string;directory?:string;hypotheses?:Record<string,HipotesisInstrumento>;shouldStop?:()=>boolean;}
export interface Progreso {version:1;signature:string;asOf:string;cursor:number;processed:number;counts:Record<string,number>;done:boolean;}
export async function guardarProgreso(file:string,p:Progreso):Promise<void> {
  fs.writeFileSync(file+'.tmp',JSON.stringify(p,null,2));
  for(let attempt=0;attempt<12;attempt++) {
    try{fs.renameSync(file+'.tmp',file);return;}
    catch(e:any){
      // Windows readers/antivirus may briefly hold the destination open.
      if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt===11)throw e;
      await new Promise(resolve=>setTimeout(resolve,Math.min(2**attempt,500)));
    }
  }
}
export async function ejecutarLote(pool:Pool,opts:OpcionesLote):Promise<Progreso> {
  if(!Number.isInteger(opts.batchSize)||opts.batchSize<1||opts.batchSize>1000)throw new Error('batchSize 1..1000');
  if(opts.limit!==undefined&&(!Number.isInteger(opts.limit)||opts.limit<1))throw new Error('limit entero positivo');
  const dir=opts.directory??path.join(raizProyecto(),'server/resultados_valoraciones/v2');fs.mkdirSync(dir,{recursive:true});
  const checkpoint=path.join(dir,'progreso.json'),journal=path.join(dir,'incidencias.jsonl');
  const signature=huella({mode:opts.mode,dryRun:opts.dryRun,asOf:opts.asOf,instrumentId:opts.instrumentId,hypotheses:opts.hypotheses,engine:manifiestoMotor(),adapterPolicy:'CLASSIFICATION_SIZE_PROFILE_V2'});
  const localLock=path.join(dir,'progreso.lock');
  if(opts.resume&&fs.existsSync(localLock)) {
    const previous=JSON.parse(fs.readFileSync(localLock,'utf8'));
    if(!Number.isSafeInteger(previous.pid)||previous.pid<=0)throw new Error('Lock inválido: revisar propietario antes de recuperar');
    try{process.kill(previous.pid,0);throw new Error('El worker anterior sigue activo');}catch(e:any){if(e.code==='ESRCH')fs.unlinkSync(localLock);else throw e;}
  }
  const fd=fs.openSync(localLock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,started:new Date().toISOString()}));
  try {
    if(!opts.dryRun){const c=await pool.getConnection();try{await comprobarEsquema(c);}finally{c.release();}}
    let p:Progreso={version:1,signature,asOf:opts.asOf,cursor:0,processed:0,counts:{},done:false};
    if(opts.resume){if(!fs.existsSync(checkpoint))throw new Error('No existe checkpoint');p=JSON.parse(fs.readFileSync(checkpoint,'utf8'));if(p.signature!==signature)throw new Error('Checkpoint incompatible con modo/fecha/hipótesis');}
    else if(fs.existsSync(checkpoint)) {
      const previous=JSON.parse(fs.readFileSync(checkpoint,'utf8'));
      if(!previous.done)throw new Error('Ejecución anterior interrumpida: usar --resume o un directorio nuevo');
      fs.appendFileSync(path.join(dir,'ejecuciones.jsonl'),JSON.stringify(previous)+'\n');
    }
    if(!opts.resume)await guardarProgreso(checkpoint,p);
    let count=0;
    while(!p.done&&!opts.shouldStop?.()&&(opts.limit===undefined||count<opts.limit)) {
      const [ids]=await pool.query<RowDataPacket[]>('SELECT id FROM instrumento WHERE id>? AND (? IS NULL OR id=?) ORDER BY id LIMIT ?',[p.cursor,opts.instrumentId??null,opts.instrumentId??null,opts.batchSize]);
      if(!ids.length){p.done=true;await guardarProgreso(checkpoint,p);break;}
      for(const row of ids){if(opts.shouldStop?.()||(opts.limit!==undefined&&count>=opts.limit))break;const id=Number(row.id);let entry:Record<string,unknown>={instrumento_id:id};
        try {
          const prepare=async(c:any)=>{await c.query('START TRANSACTION READ ONLY');try{const out=await prepararInstrumento(c,id,opts.asOf,opts.hypotheses?.[String(id)]);await c.rollback();return out;}catch(e){await c.rollback();throw e;}};
          if(opts.dryRun){const c=await pool.getConnection();try{const prep=await prepare(c),result=cargarMotor().valorar(prep.input);entry={...entry,empresa_id:prep.input.company_id,ticker:prep.input.ticker,currency:prep.input.currency,hash:prep.hash,state:validarResultado(prep.input,result),valuations:result.valuations,warnings:result.warnings};}finally{c.release();}}
          else{let saved:any;for(let attempt=0;attempt<3;attempt++)try{saved=await conBloqueoInstrumento(pool,id,async c=>persistirEnConexion(c,await prepare(c),cargarMotor().valorar,opts.mode==='full'));break;}catch(e:any){if(!['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','PROTOCOL_CONNECTION_LOST'].includes(e.code)||attempt===2)throw e;}entry={...entry,state:saved.reused?'REUTILIZADA':saved.financialState,run_id:saved.runId,snapshot_id:saved.snapshotId};}
        }catch(e:any){entry={...entry,state:e instanceof Pendiente||/DATO_(AUSENTE|INVALIDO)|PENDIENTE|CLASIFICACION_PENDIENTE|insuficientes|Falta/.test(e.message)?'DATOS_PENDIENTES':'ERROR_TECNICO',code:e.code??e.message.match(/^([A-Z_]+):/)?.[1]??null,error:e.message};}
        fs.appendFileSync(journal,JSON.stringify(entry)+'\n');const state=String(entry.state);p.counts[state]=(p.counts[state]??0)+1;p.cursor=id;p.processed++;count++;await guardarProgreso(checkpoint,p);console.log(JSON.stringify(entry));
      }
    }return p;
  }finally{fs.closeSync(fd);fs.unlinkSync(localLock);}
}
