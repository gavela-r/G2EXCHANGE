// Descarga reanudable de /v2/fins/summary (J-Quants V2, plan Free) por fecha de publicación TDnet.
// Una petición (más paginación) por día laborable, dentro del guardián global (30/min, 429 → 2 min, 403 fuera de
// plan memorizado sin reintento). Guarda la respuesta íntegra por fecha con su sha256 y un checkpoint atómico.
// Datos sólo para uso personal de verificación (condiciones JPX): el directorio de salida está fuera del repositorio.
// Uso: node scripts/jquants-resumenes.cjs --from 2024-08-01 --to 2026-08-31 [--dir private_backups/jquants-v2]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
require('dotenv').config({path:process.env.G2_ENV_FILE||path.join(root,'.env'),quiet:true});
const {JQuants}=require('../dist/src/proveedores/conectores');
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:d;};
const dir=path.resolve(root,arg('--dir','private_backups/jquants-v2')),raw=path.join(dir,'raw'),ckFile=path.join(dir,'checkpoint.json');
function dias(from,to){const out=[];for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=86400000){const d=new Date(t);if(d.getUTCDay()%6)out.push(d.toISOString().slice(0,10));}return out;}
function guardar(ck){const tmp=ckFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(ck,null,1));fs.renameSync(tmp,ckFile);}
async function main(){
 fs.mkdirSync(raw,{recursive:true});
 const ck=fs.existsSync(ckFile)?JSON.parse(fs.readFileSync(ckFile,'utf8')):{created_at:new Date().toISOString(),done:{},outOfPlan:{},errors:{}};
 const jq=new JQuants(process.env,undefined);
 const pendientes=dias(arg('--from','2024-08-01'),arg('--to','2026-08-31')).filter(d=>!ck.done[d]&&!ck.outOfPlan[d]);
 console.log(JSON.stringify({pendientes:pendientes.length,hechos:Object.keys(ck.done).length}));
 for(const d of pendientes){
  try{
   const filas=await jq.resumenes({date:d}),texto=JSON.stringify(filas);
   fs.writeFileSync(path.join(raw,d+'.json'),texto);
   ck.done[d]={rows:filas.length,fy:filas.filter(f=>f.CurPerType==='FY').length,sha256:crypto.createHash('sha256').update(texto).digest('hex'),at:new Date().toISOString()};
  }catch(e){
   if(e.codigo==='HTTP_403'||e.codigo==='HTTP_400'){ck.outOfPlan[d]={status:e.status,at:new Date().toISOString()};}
   else if(['CIRCUITO_ABIERTO','LIMITE_GLOBAL','HTTP_429','HTTP_401','CREDENCIAL_NO_CONFIGURADA'].includes(e.codigo)){ck.paused={code:e.codigo,resumeAt:e.reanudarEn?new Date(e.reanudarEn).toISOString():null,at:new Date().toISOString()};guardar(ck);console.error('PAUSA',e.codigo,e.message);process.exitCode=75;return;}
   else ck.errors[d]={code:e.codigo??null,message:String(e.message).slice(0,200)};
  }
  guardar(ck);
 }
 delete ck.paused;ck.completed_at=new Date().toISOString();guardar(ck);
 const t=Object.values(ck.done).reduce((a,x)=>({rows:a.rows+x.rows,fy:a.fy+x.fy}),{rows:0,fy:0});
 console.log(JSON.stringify({dias:Object.keys(ck.done).length,fueraDePlan:Object.keys(ck.outOfPlan).length,errores:Object.keys(ck.errors).length,...t}));
}
main().catch(e=>{console.error(e.codigo??'',e.message);process.exitCode=1;});
