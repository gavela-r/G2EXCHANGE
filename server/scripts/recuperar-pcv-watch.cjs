// Optional supervisor: resumes a partial checkpoint, retries quota-deferred
// companies after the daily reset, and never creates additional API keys.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const args=process.argv.slice(2),idx=args.indexOf('--directory');if(idx<0||!args[idx+1])throw new Error('--directory explícito obligatorio');
const directory=path.resolve(args[idx+1]),checkpoint=path.join(directory,'checkpoint.json');let stopped=false,child;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;if(child)child.kill('SIGTERM');});
const sleep=ms=>new Promise(resolve=>{const timer=setTimeout(resolve,ms);process.once('SIGTERM',()=>{clearTimeout(timer);resolve();});process.once('SIGINT',()=>{clearTimeout(timer);resolve();});});
(async()=>{let failures=0;while(!stopped){const exists=fs.existsSync(checkpoint),state=exists?JSON.parse(fs.readFileSync(checkpoint)):null;if(state?.done){console.log('Recuperación terminada; revisar cobertura y pendientes de datos.');break;}
 const runArgs=[path.join(__dirname,'recuperar-pcv-proveedores.cjs'),...args.filter(a=>a!=='--resume'),...(exists?['--resume']:[])];
 const code=await new Promise(resolve=>{child=spawn(process.execPath,runArgs,{stdio:'inherit',windowsHide:true});child.on('exit',resolve);child.on('error',()=>resolve(1));});child=null;if(stopped)break;
 const current=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)):null;
 if(code){if(++failures>=3)throw new Error('Tres fallos consecutivos: revisar configuración/checkpoint; no se fuerza su aceptación');await sleep(30000);continue;}
 failures=0;if(current?.done)break;
 if(current?.scan_complete){const midnight=new Date();midnight.setUTCDate(midnight.getUTCDate()+1);midnight.setUTCHours(0,1,0,0);console.log('Cuotas/errores pendientes guardados; próximo intento después del reinicio diario UTC.');await sleep(Math.max(60000,midnight-Date.now()));}
 else await sleep(1000);
}})().catch(e=>{console.error(e.message);process.exitCode=1;});
