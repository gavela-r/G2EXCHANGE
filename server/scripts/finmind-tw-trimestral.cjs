// Descarga reanudable de TaiwanStockFinancialStatements (FinMind, trimestre aislado) 2022-2025 para reconstruir los
// importes anuales de resultados (src/pcv/finmindTrimestral.ts). Una petición por empresa, siempre a través del
// guardián global (120/h, sin reintentos de 4xx, pausa >= 35 min ante bloqueo de IP). No escribe en MySQL: guarda la
// respuesta por empresa con su sha256 y un checkpoint. Ante una pausa del proveedor guarda el estado y termina (75).
// Uso: node scripts/finmind-tw-trimestral.cjs --file tickers.txt [--dir private_backups/finmind-tw-trimestral]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
require('dotenv').config({path:process.env.G2_ENV_FILE||path.join(root,'.env'),quiet:true});
const {finmindJson}=require('../dist/src/proveedores/guardiaHttp');
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:d;};
const dir=path.resolve(root,arg('--dir','private_backups/finmind-tw-trimestral')),raw=path.join(dir,'raw'),ckFile=path.join(dir,'checkpoint.json');
const guardar=ck=>{const t=ckFile+'.tmp';fs.writeFileSync(t,JSON.stringify(ck,null,1));fs.renameSync(t,ckFile);};
(async()=>{
 fs.mkdirSync(raw,{recursive:true});
 const lista=fs.readFileSync(arg('--file'),'utf8').split(/\s+/).filter(t=>/^\d{4}$/.test(t));
 const ck=fs.existsSync(ckFile)?JSON.parse(fs.readFileSync(ckFile,'utf8')):{created_at:new Date().toISOString(),done:{},failed:{}};
 for(const t of lista){
  if(ck.done[t]||ck.failed[t])continue;
  try{
   const j=await finmindJson(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockFinancialStatements&data_id=${t}&start_date=2022-01-01&end_date=2025-12-31`,{esperaMaximaMs:45*60000});
   const texto=JSON.stringify(j.data??[]);fs.writeFileSync(path.join(raw,t+'.json'),texto);
   ck.done[t]={rows:(j.data??[]).length,sha256:crypto.createHash('sha256').update(texto).digest('hex'),at:new Date().toISOString()};
  }catch(e){
   if(['CIRCUITO_ABIERTO','LIMITE_GLOBAL','BLOQUEO_IP','HTTP_401','HTTP_402','HTTP_429'].includes(e.codigo)){ck.paused={code:e.codigo,resumeAt:e.reanudarEn?new Date(e.reanudarEn).toISOString():null,at:new Date().toISOString()};guardar(ck);console.error('PAUSA',e.codigo);process.exitCode=75;return;}
   ck.failed[t]={code:e.codigo??null,status:e.status??null};
  }
  guardar(ck);
 }
 delete ck.paused;ck.completed_at=new Date().toISOString();guardar(ck);
 console.log(JSON.stringify({empresas:lista.length,descargadas:Object.keys(ck.done).length,fallidas:Object.keys(ck.failed).length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
