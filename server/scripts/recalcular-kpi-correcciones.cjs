// Recalcula los KPI persistidos con el escritor único kpiSincronizarInforme (insercionKPIInformeFinanciero.ts): misma
// fórmula, reglas vigentes (SELECCION_OBSERVACIONES, evidencia primaria, perímetro de ROE, deuda V2). Sólo escribe
// cambios reales y retira con causa lo que ya no es calculable; un valor ausente nunca se guarda como cero.
//   node scripts/recalcular-kpi-correcciones.cjs --todos --checkpoint <dir> [--lote 200] [--aplicar]
//   node scripts/recalcular-kpi-correcciones.cjs --ledger <sha256> | --informes <archivo> --snapshot <f> [--exclusiones <f>] [--aplicar]
//   node scripts/recalcular-kpi-correcciones.cjs --restaurar <snapshot.ndjson>
// --todos: universo congelado (informes con PCV o con KPI) en <dir>/universo.txt; un lote = una transacción; el
// snapshot de los informes que cambian se escribe y sincroniza ANTES del commit; <dir>/estado.json se reemplaza de
// forma atómica tras el commit. Reanudable: repetir el comando continúa en el siguiente lote; rehacer un lote ya
// confirmado no cambia nada (idempotente) y no añade líneas al snapshot. Sin --aplicar sólo cuenta.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),crypto=require('node:crypto');
const pool=require('../dist/conexion/bd').default;
const K=require('../dist/insercionDatos/insercionKPIInformeFinanciero');
const {POLITICA_SELECCION}=require('../dist/src/pcv/seleccionObservaciones');
const arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null;};
const NL=String.fromCharCode(10);

// Restaura el estado previo: por informe, la PRIMERA aparición en el snapshot (estado anterior a la primera escritura).
async function restaurar(file){
 const porInforme=new Map();
 for await(const l of readline.createInterface({input:fs.createReadStream(file)})){if(!l.trim())continue;const r=JSON.parse(l);if(!porInforme.has(r.informe_id))porInforme.set(r.informe_id,r.antes);}
 const ids=[...porInforme.keys()];let n=0;
 for(let i=0;i<ids.length;i+=500){const c=await pool.getConnection();
  try{await c.beginTransaction();
   for(const id of ids.slice(i,i+500)){const antes=porInforme.get(id);await c.query('DELETE FROM kpi_financiero_informe WHERE informe_id=?',[id]);
    if(antes.length)await c.query('INSERT INTO kpi_financiero_informe(informe_id,kpi,valor,unidad,nivel_confianza) VALUES ?',[antes.map(k=>[id,k.kpi,k.valor,k.unidad,k.nivel_confianza])]);n++;}
   await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}}
 return{restaurados:n};
}
const totales=()=>({informes:0,informesConCambios:0,kpiAntes:0,kpiDespues:0,nuevos:0,cambiados:0,iguales:0,eliminados:0,pendientes:0,informesConConceptoSinResolver:0,normalizacionRechazada:0,eliminadosPorMotivo:{},pendientesPorMotivo:{}});
function acumular(t,r){
 t.informes++;t.kpiAntes+=r.antes.length;t.kpiDespues+=r.iguales+r.escribir.length;t.nuevos+=r.nuevos;t.cambiados+=r.cambiados;t.iguales+=r.iguales;
 t.eliminados+=r.eliminados.length;t.pendientes+=r.pendientes.length;if(r.sinResolver)t.informesConConceptoSinResolver++;if(r.error)t.normalizacionRechazada++;
 if(r.escribir.length||r.eliminados.length)t.informesConCambios++;
 for(const e of r.eliminados){const m=e.motivo.split(':')[0];t.eliminadosPorMotivo[m]=(t.eliminadosPorMotivo[m]??0)+1;}
 for(const e of r.pendientes)t.pendientesPorMotivo[e.motivo]=(t.pendientesPorMotivo[e.motivo]??0)+1;
}
const escribirSync=(fd,lineas)=>{if(!lineas.length)return;fs.writeSync(fd,lineas.join(NL)+NL);fs.fsyncSync(fd);};
async function procesar(ids,{aplicar,snapshotFd,exclusionesFd,lote,desde=0,alTerminarLote}){
 const t=totales();
 for(let i=desde;i<ids.length;i+=lote){const c=await pool.getConnection();
  try{if(aplicar)await c.beginTransaction();const snap=[],excl=[];
   for(const id of ids.slice(i,i+lote)){const r=await K.kpiSincronizarInforme(c,id,aplicar);acumular(t,r);
    if(r.escribir.length||r.eliminados.length)snap.push(JSON.stringify({informe_id:id,antes:r.antes}));
    for(const e of [...r.eliminados,...r.pendientes])excl.push(JSON.stringify({informe_id:id,kpi:e.kpi,motivo:e.motivo,politica:POLITICA_SELECCION,error:r.error}));}
   if(aplicar){if(snapshotFd!==null)escribirSync(snapshotFd,snap);else if(snap.length)throw Error('Falta snapshot');await c.commit();}
   if(exclusionesFd!==null)escribirSync(exclusionesFd,excl);
  }catch(e){if(aplicar)await c.rollback();throw e;}finally{c.release();}
  if(alTerminarLote)alTerminarLote(Math.min(i+lote,ids.length),t);
 }
 return t;
}
function sumar(a,b){const r={...a};for(const[k,v]of Object.entries(b)){if(typeof v==='number')r[k]=(r[k]??0)+v;else if(v&&typeof v==='object'){r[k]={...(r[k]??{})};for(const[m,n]of Object.entries(v))r[k][m]=(r[k][m]??0)+n;}}return r;}

async function global(dir,aplicar){
 if(!dir)throw Error('--checkpoint <dir> obligatorio con --todos');fs.mkdirSync(dir,{recursive:true});
 const uf=path.join(dir,'universo.txt'),ef=path.join(dir,'estado.json'),lote=Number(arg('--lote')||200);
 if(!fs.existsSync(uf)){const[r]=await pool.query('SELECT id FROM informe_financiero WHERE id IN (SELECT DISTINCT informe_id FROM partida_contable_valor) OR id IN (SELECT DISTINCT informe_id FROM kpi_financiero_informe) ORDER BY id');fs.writeFileSync(uf,r.map(x=>x.id).join(NL));}
 const ids=fs.readFileSync(uf,'utf8').split(NL).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0),universo=crypto.createHash('sha256').update(ids.join(',')).digest('hex');
 const estado=fs.existsSync(ef)?JSON.parse(fs.readFileSync(ef,'utf8')):{universo,aplicar,siguiente:0,totales:totales(),inicio:new Date().toISOString()};
 if(estado.universo!==universo||estado.aplicar!==aplicar)throw Error('El checkpoint corresponde a otro universo o modo; usar otro directorio');
 const snapshotFd=aplicar?fs.openSync(path.join(dir,'snapshot.ndjson'),'a'):null,exclusionesFd=fs.openSync(path.join(dir,aplicar?'exclusiones.ndjson':'exclusiones_simulacion.ndjson'),estado.siguiente?'a':'w');
 const base=estado.totales;
 try{
  await procesar(ids,{aplicar,snapshotFd,exclusionesFd,lote,desde:estado.siguiente,alTerminarLote:(siguiente,t)=>{
   const nuevo={...estado,siguiente,totales:sumar(base,t),actualizado:new Date().toISOString()};const tmp=ef+'.tmp';fs.writeFileSync(tmp,JSON.stringify(nuevo,null,1));fs.renameSync(tmp,ef);
   if(siguiente%(lote*25)===0||siguiente===ids.length)console.error('lote',siguiente+'/'+ids.length);}});
 }finally{if(snapshotFd!==null)fs.closeSync(snapshotFd);fs.closeSync(exclusionesFd);}
 const fin=JSON.parse(fs.readFileSync(ef,'utf8'));return{aplicado:aplicar,universo:ids.length,universoSha256:universo,completado:fin.siguiente===ids.length,...fin.totales};
}
async function porLista(ledger,snapshot,aplicar){
 const lista=arg('--informes');if(!lista&&!/^[0-9a-f]{64}$/.test(ledger||''))throw Error('--ledger <sha256>, --informes <archivo> o --todos obligatorio');
 const ids=lista?fs.readFileSync(lista,'utf8').split(NL).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0):(await pool.query('SELECT DISTINCT informe_id FROM pcv_correccion_auditoria WHERE ledger_sha256=? AND revertido_en IS NULL ORDER BY informe_id',[ledger]))[0].map(r=>r.informe_id);
 const snapshotFd=aplicar?fs.openSync(snapshot,'wx'):null,ex=arg('--exclusiones'),exclusionesFd=ex?fs.openSync(ex,'w'):null;
 try{return{aplicado:aplicar,...await procesar(ids,{aplicar,snapshotFd,exclusionesFd,lote:200})};}finally{if(snapshotFd!==null)fs.closeSync(snapshotFd);if(exclusionesFd!==null)fs.closeSync(exclusionesFd);}
}
(async()=>{const aplicar=process.argv.includes('--aplicar');
 const r=arg('--restaurar')?await restaurar(arg('--restaurar')):process.argv.includes('--todos')?await global(arg('--checkpoint'),aplicar):await porLista(arg('--ledger'),arg('--snapshot'),aplicar);
 console.log(JSON.stringify(r));})()
 .catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
