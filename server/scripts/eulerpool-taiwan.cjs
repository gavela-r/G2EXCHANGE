// Descarga reanudable de estados anuales de Eulerpool (plan gratuito, uso NO comercial) para empresas de Taiwán,
// a través del guardián global (600/h, 1,5 s entre peticiones, 429/403/402 sin insistir). Sólo para contrastar
// los PCV existentes: los datos se guardan fuera del repositorio y nunca se redistribuyen ni certifican.
// Uso: node scripts/eulerpool-taiwan.cjs --tickers 2330,2317,2454 | --file tickers.txt [--dir private_backups/eulerpool-tw]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
require('dotenv').config({path:process.env.G2_ENV_FILE||path.join(root,'.env'),quiet:true});
const {Eulerpool,isinTaiwan}=require('../dist/src/proveedores/conectores');
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:d;};
const dir=path.resolve(root,arg('--dir','private_backups/eulerpool-tw')),raw=path.join(dir,'raw'),ckFile=path.join(dir,'checkpoint.json');
const ENDPOINTS=['incomestatement','balancesheet','cashflowstatement'];
function guardar(ck){const tmp=ckFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(ck,null,1));fs.renameSync(tmp,ckFile);}
async function main(){
 fs.mkdirSync(raw,{recursive:true});
 const lista=(arg('--tickers')?arg('--tickers').split(','):fs.readFileSync(arg('--file'),'utf8').split(/\s+/)).map(s=>s.trim()).filter(s=>/^\d{4}$/.test(s));
 const ck=fs.existsSync(ckFile)?JSON.parse(fs.readFileSync(ckFile,'utf8')):{created_at:new Date().toISOString(),done:{},failed:{}};
 const ep=new Eulerpool(process.env);let restante=null;
 for(const t of lista){
  const isin=isinTaiwan(t);
  for(const e of ENDPOINTS){
   const k=isin+'_'+e;if(ck.done[k]||ck.failed[k])continue;
   try{const r=await ep.equity(e,isin),texto=JSON.stringify(r.datos);restante=r.limite.restante;
    fs.writeFileSync(path.join(raw,k+'.json'),texto);ck.done[k]={ticker:t,rows:Array.isArray(r.datos)?r.datos.length:0,sha256:crypto.createHash('sha256').update(texto).digest('hex'),at:new Date().toISOString()};}
   catch(err){
    if(['CIRCUITO_ABIERTO','LIMITE_GLOBAL','HTTP_429','HTTP_401','HTTP_402','BLOQUEO_IP','CREDENCIAL_NO_CONFIGURADA'].includes(err.codigo)){ck.paused={code:err.codigo,at:new Date().toISOString()};guardar(ck);console.error('PAUSA',err.codigo,err.message);process.exitCode=75;return;}
    ck.failed[k]={ticker:t,code:err.codigo??null,status:err.status??null};
   }
   guardar(ck);
  }
 }
 delete ck.paused;guardar(ck);
 console.log(JSON.stringify({empresas:lista.length,descargados:Object.keys(ck.done).length,fallidos:Object.keys(ck.failed).length,cuotaMensualRestante:restante}));
}
main().catch(e=>{console.error(e.codigo??'',e.message);process.exitCode=1;});
