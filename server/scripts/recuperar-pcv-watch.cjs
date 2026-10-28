// Optional supervisor: resumes a partial checkpoint, retries quota-deferred
// companies after the daily reset, and never creates additional API keys.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const args=process.argv.slice(2),idx=args.indexOf('--directory');if(idx<0||!args[idx+1])throw new Error('--directory explícito obligatorio');
const jobIndex=args.indexOf('--job'),job=jobIndex<0?'pcv':args[jobIndex+1];if(!['pcv','reports-jp','sec-bound','jp-issued-shares'].includes(job))throw new Error('--job pcv|reports-jp|sec-bound|jp-issued-shares');
const phaseIndex=args.indexOf('--phase'),phase=phaseIndex<0?'import':args[phaseIndex+1];
const childArgs=args.filter((a,i)=>i!==jobIndex&&(jobIndex<0||i!==jobIndex+1));
const directory=path.resolve(args[idx+1]),checkpoint=path.join(directory,job==='reports-jp'&&phase==='collect'?'collect-checkpoint.json':'checkpoint.json');let stopped=false,child;
const stopFile=path.join(directory,'stop.request');
if(args.includes('--stop')){fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(stopFile,new Date().toISOString());console.log('Parada solicitada; el worker termina tras el informe actual.');process.exit(0);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;if(child)child.kill('SIGTERM');});
const sleep=async ms=>{const until=Date.now()+ms;while(!stopped&&Date.now()<until){if(fs.existsSync(stopFile)){stopped=true;break;}await new Promise(resolve=>setTimeout(resolve,Math.min(30000,until-Date.now())));}};
(async()=>{let failures=0;while(!stopped){if(fs.existsSync(stopFile))break;const exists=fs.existsSync(checkpoint),state=exists?JSON.parse(fs.readFileSync(checkpoint)):null;if(state?.done){console.log('Recuperación terminada; revisar cobertura y pendientes de datos.');break;}
 const scripts={pcv:'recuperar-pcv-proveedores.cjs','reports-jp':'recuperar-informes-jp.cjs','sec-bound':'recuperar-sec-vinculados.cjs','jp-issued-shares':'recuperar-acciones-jp.cjs'};
 const runArgs=[path.join(__dirname,scripts[job]),...childArgs.filter(a=>a!=='--resume'),...(exists?['--resume']:[])];let diagnostics='';
 const code=await new Promise(resolve=>{child=spawn(process.execPath,runArgs,{stdio:['ignore','inherit','pipe'],windowsHide:true});child.stderr.on('data',chunk=>{process.stderr.write(chunk);diagnostics=(diagnostics+chunk).slice(-8192);});child.on('exit',resolve);child.on('error',()=>resolve(1));});child=null;if(stopped||fs.existsSync(stopFile))break;
 const current=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)):null;
 if(code){if(/WORKER_ACTIVO/.test(diagnostics)){console.log('Otro lote del país mantiene el bloqueo; se conserva el turno pendiente.');await sleep(30000);continue;}if(++failures>=3)throw new Error('Tres fallos consecutivos: revisar configuración/checkpoint; no se fuerza su aceptación');await sleep(30000);continue;}
 failures=0;if(current?.done)break;
 if(current?.daemon&&current?.scan_complete&&!current?.retryReports?.length){await sleep(30000);continue;}
 if(current?.scan_complete){const midnight=new Date();midnight.setUTCDate(midnight.getUTCDate()+1);midnight.setUTCHours(0,1,0,0);console.log('Cuotas/errores pendientes guardados; próximo intento después del reinicio diario UTC.');await sleep(Math.max(60000,midnight-Date.now()));}
 else await sleep(1000);
}})().catch(e=>{console.error(e.message);process.exitCode=1;});
