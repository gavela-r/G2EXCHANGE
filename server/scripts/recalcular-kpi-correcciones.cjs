// Recalcula los KPI de los informes afectados por la migración 31 (pcv_correccion_auditoria de un registro) con la
// fórmula sin cambios (insercionKPIInformeFinanciero.kpiCalcularInforme) y la política de prerrequisitos vigente
// (pcv-prerrequisitos-kpi.cjs). Antes de escribir guarda un snapshot NDJSON de los KPI de cada informe, de modo que el
// recálculo es reversible:
//   node scripts/recalcular-kpi-correcciones.cjs --ledger <sha256> --snapshot <archivo.ndjson> [--aplicar]
//   node scripts/recalcular-kpi-correcciones.cjs --restaurar <archivo.ndjson>
// Sin --aplicar sólo calcula y cuenta (no escribe). Los KPI que dejan de ser calculables con los datos corregidos se
// eliminan (constan en el snapshot); un valor ausente nunca se guarda como cero.
const fs=require('node:fs'),readline=require('node:readline');
const pool=require('../dist/conexion/bd').default;
const K=require('../dist/insercionDatos/insercionKPIInformeFinanciero');
require('./pcv-prerrequisitos-kpi.cjs').instalarRequisitos();
const arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null;};

async function restaurar(file){
 const porInforme=new Map();
 for await(const l of readline.createInterface({input:fs.createReadStream(file)})){if(!l.trim())continue;const r=JSON.parse(l);porInforme.set(r.informe_id,r.antes);}
 const c=await pool.getConnection();let n=0;
 try{await c.beginTransaction();
  for(const[id,antes]of porInforme){await c.query('DELETE FROM kpi_financiero_informe WHERE informe_id=?',[id]);
   if(antes.length)await c.query('INSERT INTO kpi_financiero_informe(informe_id,kpi,valor,unidad,nivel_confianza) VALUES ?',[antes.map(k=>[id,k.kpi,k.valor,k.unidad,k.nivel_confianza])]);n++;}
  await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
 return{restaurados:n};
}

async function recalcular(ledger,snapshot,aplicar){
 if(!/^[0-9a-f]{64}$/.test(ledger||''))throw Error('--ledger <sha256> obligatorio');
 const[ids]=await pool.query('SELECT DISTINCT informe_id FROM pcv_correccion_auditoria WHERE ledger_sha256=? AND revertido_en IS NULL ORDER BY informe_id',[ledger]);
 const out=aplicar?fs.createWriteStream(snapshot,{flags:'wx'}):null;const t={informes:ids.length,kpiAntes:0,kpiDespues:0,cambiados:0,nuevos:0,eliminados:0,iguales:0};
 for(let i=0;i<ids.length;i+=200){const lote=ids.slice(i,i+200).map(r=>r.informe_id),c=await pool.getConnection();
  try{if(aplicar)await c.beginTransaction();
   for(const id of lote){
    const[antes]=await c.query('SELECT kpi,valor,unidad,nivel_confianza FROM kpi_financiero_informe WHERE informe_id=? ORDER BY kpi',[id]);
    const nuevos=K.kpiCalcularInforme(id,await K.kpiCargarPartidas(id)).filter(k=>k.valor!==null&&Number.isFinite(Number(k.valor)));
    const previo=new Map(antes.map(k=>[k.kpi,k])),actual=new Set(nuevos.map(k=>k.kpi));t.kpiAntes+=antes.length;t.kpiDespues+=nuevos.length;
    for(const k of nuevos){const p=previo.get(k.kpi);if(!p)t.nuevos++;else if(Number(p.valor)!==Number(k.valor))t.cambiados++;else t.iguales++;}
    const eliminar=antes.filter(k=>!actual.has(k.kpi)).map(k=>k.kpi);t.eliminados+=eliminar.length;
    if(aplicar){out.write(JSON.stringify({informe_id:id,antes})+'\n');
     if(eliminar.length)await c.query('DELETE FROM kpi_financiero_informe WHERE informe_id=? AND kpi IN (?)',[id,eliminar]);
     if(nuevos.length)await c.query('INSERT INTO kpi_financiero_informe(informe_id,kpi,valor,unidad,nivel_confianza) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor),unidad=VALUES(unidad),nivel_confianza=VALUES(nivel_confianza),fecha_calculo=CURRENT_TIMESTAMP',[nuevos.map(k=>[k.informeId,k.kpi,k.valor,k.unidad,k.nivelConfianza])]);}
   }
   if(aplicar)await c.commit();
  }catch(e){if(aplicar)await c.rollback();throw e;}finally{c.release();}
 }
 if(out)await new Promise(r=>out.end(r));
 return{aplicado:!!aplicar,...t};
}
(async()=>{const r=arg('--restaurar')?await restaurar(arg('--restaurar')):await recalcular(arg('--ledger'),arg('--snapshot'),process.argv.includes('--aplicar'));console.log(JSON.stringify(r));})()
 .catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
