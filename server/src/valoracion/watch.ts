import pool from '../../conexion/bd';
import { ejecutarLote } from './lotes';
import { opcionesCli } from '../../valoracionAutomatica';
import path from 'node:path';
import { raizProyecto } from './rutas';
import fs from 'node:fs';
/** Periodic reconciliation detects changed financials/KPI/quotes/market/model hypotheses through fingerprints. */
export async function reconciliar(shouldStop?:()=>boolean,args=process.argv.slice(2)):Promise<void> {
  const opts=opcionesCli(args.filter(a=>a!=='--once'));opts.mode='incremental';opts.resume=false;
  opts.shouldStop=shouldStop;
  opts.directory??=path.join(raizProyecto(),'server/resultados_valoraciones/reconciliacion');
  const checkpoint=path.join(opts.directory,'progreso.json');
  if(fs.existsSync(checkpoint)){const previous=JSON.parse(fs.readFileSync(checkpoint,'utf8'));if(!previous.done){opts.resume=true;opts.asOf=previous.asOf;}}
  await ejecutarLote(pool,opts);
}
if(require.main===module) {
  const minutes=Number(process.env.G2_RECONCILIATION_MINUTES??60);
  if(!Number.isFinite(minutes)||minutes<1)throw new Error('G2_RECONCILIATION_MINUTES >=1');
  let stopped=false;
  const stop=()=>{stopped=true;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  const once=process.argv.includes('--once');
  (async()=>{try{while(!stopped){try{await reconciliar(()=>stopped);}catch(e){if(once)throw e;console.error('Reconciliación fallida; siguiente intento programado',e);}if(once)break;if(!stopped)await new Promise<void>(resolve=>{const end=()=>{clearTimeout(timer);process.off('SIGINT',end);process.off('SIGTERM',end);resolve();};const timer=setTimeout(end,minutes*60000);process.once('SIGINT',end);process.once('SIGTERM',end);});}}finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
}
