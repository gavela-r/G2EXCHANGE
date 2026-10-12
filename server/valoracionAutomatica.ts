import pool from './conexion/bd';
import { ejecutarLote, OpcionesLote } from './src/valoracion/lotes';
import fs from 'node:fs';
export function opcionesCli(args=process.argv.slice(2)):OpcionesLote {
 const allowed=['--mode','--dry-run','--write','--resume','--batch-size','--limit','--instrument-id','--as-of','--directory','--hypotheses'];
 for(const a of args.filter(x=>x.startsWith('--')))if(!allowed.includes(a))throw new Error('Opción desconocida '+a);
 const arg=(key:string,fallback?:string)=>{const n=args.indexOf(key);if(n<0)return fallback;if(!args[n+1]||args[n+1].startsWith('--'))throw new Error('Falta valor '+key);return args[n+1];};
 if(args.includes('--write')&&args.includes('--dry-run'))throw new Error('Elegir --write o --dry-run');
 const mode=arg('--mode','incremental');if(mode!=='full'&&mode!=='incremental')throw new Error('mode full|incremental');
 const fecha=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const file=arg('--hypotheses');
 const instrumentId=arg('--instrument-id')?Number(arg('--instrument-id')):undefined;
 if(instrumentId!==undefined&&(!Number.isSafeInteger(instrumentId)||instrumentId<=0))throw new Error('instrument-id entero positivo');
 return {mode,dryRun:!args.includes('--write'),resume:args.includes('--resume'),batchSize:Number(arg('--batch-size','100')),limit:arg('--limit')?Number(arg('--limit')):undefined,instrumentId,asOf:arg('--as-of',fecha)!,directory:arg('--directory'),hypotheses:file?JSON.parse(fs.readFileSync(file,'utf8')):undefined};
}
if(require.main===module)ejecutarLote(pool,opcionesCli()).then(p=>console.log(JSON.stringify({summary:p}))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
