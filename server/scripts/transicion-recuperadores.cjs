// Transición controlada de los recuperadores PCV al código de entrega (HANDOFF.md §3).
//   node scripts/transicion-recuperadores.cjs --comprobar   → sólo lectura; sale con 1 si alguna condición falla
//   node scripts/transicion-recuperadores.cjs --reanudar    → repite las comprobaciones y, si todas pasan, retira las
//                                                             pausas (renombra stop.request); no lanza procesos
// Condiciones: ningún recuperador vivo; código compilado con identidad de observación y selección de observaciones;
// migración 33 presente en MySQL; checkpoints legibles; ninguna credencial configurada coincide con una huella
// comprometida (private_backups/credenciales-comprometidas.sha256.json, sólo SHA-256, nunca valores).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const TRABAJOS=['pcv-us-complementos-v5','pcv-jp-complementos-identidad-v5'];
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');

function leerEnv(file){
 if(!fs.existsSync(file))return null;
 return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,'').trim()]));
}
// Devuelve los NOMBRES de las variables cuyo valor coincide con una huella comprometida (nunca los valores).
function credencialesComprometidas(env,huellas){
 const set=new Set(huellas.map(h=>h.sha256));
 return Object.entries(env).filter(([k,v])=>/KEY|TOKEN|SECRET|PASSWORD/.test(k)&&v.length>=8&&set.has(sha(v))).map(([k])=>k).sort();
}
function procesosRecuperadores(){
 try{
  const out=process.platform==='win32'
   ?execFileSync('powershell',['-NoProfile','-Command',"Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.CommandLine }"],{encoding:'utf8'})
   :execFileSync('ps',['-eo','args'],{encoding:'utf8'});
  return out.split(/\r?\n/).filter(l=>/recuperar-pcv-(watch|plan)\.cjs/.test(l)&&!/--stop\b/.test(l));
 }catch{return null;}
}
async function migracion33(){
 const pool=require('../dist/conexion/bd').default;
 try{const[r]=await pool.query("SHOW INDEX FROM partida_contable_valor WHERE Key_name='uq_pcv_identidad_observacion'");return r.length>0;}finally{await pool.end();}
}
async function comprobar({conMysql=true}={}){
 const checks=[];const add=(id,ok,detalle)=>checks.push({id,ok,detalle});
 const vivos=procesosRecuperadores();add('sin_recuperadores_vivos',vivos!==null&&vivos.length===0,vivos===null?'no se pudo listar procesos':vivos.length+' proceso(s)');
 const dist=['dist/src/pcv/seleccionObservaciones.js','dist/insercionDatos/insercionPartidaContable.js'].map(f=>path.join(root,'server',f));
 add('codigo_entrega_compilado',dist.every(fs.existsSync)&&fs.readFileSync(dist[1],'utf8').includes('identidad_observacion'),'server/dist con identidad de observación');
 if(conMysql){let ok=false,det;try{ok=await migracion33();det=ok?'índice único presente':'falta el índice';}catch(e){det='MySQL: '+e.code;}add('migracion_33',ok,det);}
 for(const t of TRABAJOS){const f=path.join(root,'private_backups',t,'checkpoint.json');let ok=false;try{JSON.parse(fs.readFileSync(f,'utf8'));ok=true;}catch{}add('checkpoint:'+t,ok,ok?'legible':'ausente o ilegible');}
 const env=leerEnv(path.join(root,'.env')),hf=path.join(root,'private_backups/credenciales-comprometidas.sha256.json');
 if(!env)add('credenciales_nuevas',false,'.env ausente: el propietario debe configurar credenciales nuevas');
 else if(!fs.existsSync(hf))add('credenciales_nuevas',false,'falta el archivo de huellas comprometidas');
 else{const malas=credencialesComprometidas(env,JSON.parse(fs.readFileSync(hf,'utf8')).huellas);add('credenciales_nuevas',malas.length===0,malas.length?'comprometidas: '+malas.join(', '):'ninguna coincide con una huella comprometida');}
 return checks;
}
async function main(){
 const reanudar=process.argv.includes('--reanudar');if(!reanudar&&!process.argv.includes('--comprobar')){console.error('Uso: --comprobar | --reanudar');process.exit(2);}
 const checks=await comprobar();for(const c of checks)console.log((c.ok?'OK   ':'FALLA')+' '+c.id+' — '+c.detalle);
 if(checks.some(c=>!c.ok)){console.log('Transición NO permitida: los recuperadores siguen en pausa.');process.exitCode=1;return;}
 if(!reanudar){console.log('Transición permitida. Ejecutar --reanudar y después: node server/scripts/recuperar-pcv-plan.cjs --write --resume --resume-jobs');return;}
 const stamp=Date.now();
 for(const f of [path.join(root,'private_backups/pcv-orchestrator/stop.request'),...TRABAJOS.map(t=>path.join(root,'private_backups',t,'stop.request'))])if(fs.existsSync(f)){fs.renameSync(f,f+'.previous-entrega-'+stamp);console.log('pausa retirada: '+path.relative(root,f));}
 console.log('Lanzar ahora: node server/scripts/recuperar-pcv-plan.cjs --write --resume --resume-jobs');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={credencialesComprometidas,leerEnv,comprobar,TRABAJOS};
