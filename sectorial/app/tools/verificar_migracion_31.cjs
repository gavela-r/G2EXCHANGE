// Verificación de la migración 31 (ensayo en copia aislada y aplicación controlada). Sólo lee la base.
//   estado    <ledger> <salida.json>          huella previa: PCV fuera del registro (sha256 por filas), filas del
//                                             registro, evidencias por resultado y CHECKSUM de las tablas tocadas
//   verificar <ledger> <previo.json> [--concurrente]
//             tras aplicar: sólo cambiaron filas del registro, cada fila auditada tiene el valor nuevo y el anterior
//             queda en la auditoría; evidencias nuevas marcadas con el sha256 del registro. Con --concurrente (base
//             operativa con otros escritores) no se exige igualdad de las filas ajenas al registro.
//   revertido <ledger> <previo.json>          tras el rollback: PCV y evidencias idénticos al estado previo
// La conexión usa DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME del entorno o, si faltan, del .env del proyecto.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const{database}=require('../runtime.cjs');

function leerRegistro(file){
 const texto=fs.readFileSync(file,'utf8'),L=crypto.createHash('sha256').update(texto).digest('hex'),ids=new Map();let celdas=0;
 for(const l of texto.split(String.fromCharCode(10))){if(!l.trim())continue;const r=JSON.parse(l);celdas++;
  if(r.rule==='US_PERIODO_V1')for(const o of r.originals)if(o.id!==null&&o.importe!==null&&o.importe!==r.value)ids.set(o.id,{antes:o.importe,despues:r.value});
  if(r.rule==='JP_EFECTIVO_EQUIVALENTES_V1')for(const o of r.originals)if(o.id!==null&&o.importe!==null)ids.set(o.id,{reclasificado:true});}
 return{L,ids,celdas};
}
// maxPrevio: las filas insertadas por la migración (id > máximo previo) quedan fuera de la comparación.
async function huella(conn,ids,maxPrevio=Infinity){
 const h=crypto.createHash('sha256');let filas=0,ultimo=0,nuevas=0;const registro={};
 for(;;){const[rs]=await conn.query('SELECT id,informe_id,concepto_estandar_id,importe,concepto FROM partida_contable_valor WHERE id>? ORDER BY id LIMIT 200000',[ultimo]);if(!rs.length)break;
  for(const r of rs){ultimo=r.id;if(r.id>maxPrevio){nuevas++;continue;}if(ids.has(r.id)){registro[r.id]=ids.get(r.id).reclasificado?Number(r.concepto_estandar_id):r.importe===null?null:Number(r.importe);continue;}filas++;h.update(`${r.id}|${r.informe_id}|${r.concepto_estandar_id}|${r.importe}|${r.concepto}\n`);}}
 return{filasFuera:filas,shaFuera:h.digest('hex'),registro,maxId:ultimo,filasNuevas:nuevas};
}
async function evidencias(conn,L){
 const[porResultado]=await conn.query('SELECT outcome,COUNT(*) n FROM pcv_verification_evidence GROUP BY outcome ORDER BY outcome');
 const[[marcadas]]=await conn.query("SELECT COUNT(*) n,SUM(outcome='VERIFIED_EXISTING') ve,SUM(outcome='CONFLICT_RESOLVED') cr FROM pcv_verification_evidence WHERE outcome IN ('VERIFIED_EXISTING','CONFLICT_RESOLVED') AND JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.correction.ledgerSha256'))=?",[L]);
 return{porResultado:Object.fromEntries(porResultado.map(r=>[r.outcome,Number(r.n)])),marcadas:{total:Number(marcadas.n),ve:Number(marcadas.ve??0),cr:Number(marcadas.cr??0)}};
}
async function auditoria(conn,L){
 const[t]=await conn.query("SHOW TABLES LIKE 'pcv_correccion_auditoria'");if(!t.length)return null;
 const[[a]]=await conn.query("SELECT COUNT(*) n,SUM(revertido_en IS NULL) vigentes,SUM(accion='CORREGIR_VALOR_A_CANDIDATO_PRIMARIO' AND revertido_en IS NULL) cambios,SUM(accion='RECLASIFICADO' AND revertido_en IS NULL) reclasificadas,SUM(accion='INSERTADO' AND revertido_en IS NULL) insertadas FROM pcv_correccion_auditoria WHERE ledger_sha256=?",[L]);
 const[[malReclas]]=await conn.query("SELECT COUNT(*) n FROM pcv_correccion_auditoria a JOIN partida_contable_valor p ON p.id=a.pcv_id WHERE a.ledger_sha256=? AND a.revertido_en IS NULL AND a.accion='RECLASIFICADO' AND (p.concepto_estandar_id<>a.concepto_nuevo_id OR NOT (p.importe<=>a.importe_anterior))",[L]);
 const[[malIns]]=await conn.query("SELECT SUM(p.id IS NULL OR NOT (p.importe<=>a.importe_nuevo)) n FROM pcv_correccion_auditoria a LEFT JOIN partida_contable_valor p ON p.id=a.pcv_id WHERE a.ledger_sha256=? AND a.revertido_en IS NULL AND a.accion='INSERTADO'",[L]);
 const[[mal]]=await conn.query("SELECT COUNT(*) n FROM pcv_correccion_auditoria a JOIN partida_contable_valor p ON p.id=a.pcv_id WHERE a.ledger_sha256=? AND a.revertido_en IS NULL AND a.accion='CORREGIR_VALOR_A_CANDIDATO_PRIMARIO' AND NOT (p.importe<=>a.importe_nuevo)",[L]);
 const[[sinAnterior]]=await conn.query("SELECT COUNT(*) n FROM pcv_correccion_auditoria WHERE ledger_sha256=? AND accion IN ('CORREGIR_VALOR_A_CANDIDATO_PRIMARIO','RECLASIFICADO') AND importe_anterior IS NULL",[L]);
 return{filas:Number(a.n),vigentes:Number(a.vigentes??0),cambiosVigentes:Number(a.cambios??0),reclasificadas:Number(a.reclasificadas??0),insertadas:Number(a.insertadas??0),reclasificacionIncorrecta:Number(malReclas.n),insercionIncorrecta:Number(malIns.n??0),valorDistintoDelNuevo:Number(mal.n),sinImporteAnterior:Number(sinAnterior.n)};
}
async function main(){
 const[cmd,ledger,file,...rest]=process.argv.slice(2);if(!['estado','verificar','revertido'].includes(cmd)||!ledger||!file)throw Error('Uso: estado|verificar|revertido <ledger> <json>');
 const{L,ids,celdas}=leerRegistro(path.resolve(ledger)),pool=database(),conn=await pool.getConnection();
 try{
  await conn.query('SET SESSION MAX_EXECUTION_TIME=0');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const[[db]]=await conn.query('SELECT DATABASE() db,UTC_TIMESTAMP(6) at');
  const maxPrevio=cmd==='estado'?Infinity:JSON.parse(fs.readFileSync(path.resolve(file),'utf8')).maxId;
  const ahora={database:db.db,at:db.at,ledgerSha256:L,celdas,filasRegistro:ids.size,...await huella(conn,ids,maxPrevio),evidencias:await evidencias(conn,L),auditoria:await auditoria(conn,L)};
  await conn.rollback();
  if(cmd==='estado'){const{registro,...resumen}=ahora;fs.writeFileSync(path.resolve(file),JSON.stringify({...resumen,registro},null,1));console.log(JSON.stringify(resumen));return;}
  const previo=JSON.parse(fs.readFileSync(path.resolve(file),'utf8')),informe={comando:cmd,database:ahora.database,at:ahora.at,ledgerSha256:L};
  if(cmd==='verificar'){
   let corregidas=0,sinCambio=0,otroValor=0;
   let reclasificadas=0;for(const[id,e]of ids){const v=ahora.registro[id];if(e.reclasificado){if(v!==previo.registro[id])reclasificadas++;continue;}if(v===e.despues)corregidas++;else if(v===e.antes)sinCambio++;else otroValor++;}
   Object.assign(informe,{filasRegistro:ids.size,corregidas,reclasificadas,filasNuevas:ahora.filasNuevas,sinCambioPorGuarda:sinCambio,otroValor,auditoria:ahora.auditoria,evidenciasMarcadas:ahora.evidencias.marcadas,fueraDelRegistroIgual:ahora.shaFuera===previo.shaFuera,filasFuera:{antes:previo.filasFuera,despues:ahora.filasFuera}});
   assert.equal(ahora.auditoria.valorDistintoDelNuevo,0,'filas auditadas con valor distinto del nuevo');
   assert.equal(ahora.auditoria.sinImporteAnterior,0,'auditoría sin importe anterior');
   assert.equal(ahora.auditoria.cambiosVigentes,corregidas,'cada fila corregida tiene exactamente una auditoría vigente');
   assert.equal(ahora.auditoria.reclasificadas,reclasificadas,'cada reclasificación está auditada');
   assert.equal(ahora.auditoria.insertadas,ahora.filasNuevas,'cada fila nueva está auditada');
   assert.equal(ahora.auditoria.reclasificacionIncorrecta,0,'reclasificación incorrecta');assert.equal(ahora.auditoria.insercionIncorrecta,0,'inserción incorrecta');
   if(!rest.includes('--concurrente'))assert.equal(ahora.shaFuera,previo.shaFuera,'cambiaron filas ajenas al registro');
  }else{
   Object.assign(informe,{filasNuevasRestantes:ahora.filasNuevas,pcvIdentico:ahora.filasNuevas===0&&ahora.shaFuera===previo.shaFuera&&JSON.stringify(ahora.registro)===JSON.stringify(previo.registro),evidenciasIdenticas:JSON.stringify(ahora.evidencias.porResultado)===JSON.stringify(previo.evidencias.porResultado),auditoria:ahora.auditoria});
   assert.ok(informe.pcvIdentico,'el rollback no restauró los PCV');assert.ok(informe.evidenciasIdenticas,'el rollback no restauró las evidencias');
   assert.equal(ahora.auditoria.vigentes,0,'quedan correcciones sin revertir');
  }
  console.log(JSON.stringify(informe));
 }finally{conn.release();await pool.end();}
}
main().catch(e=>{console.error('VERIFICACION_FALLIDA',e.message);process.exitCode=1;});
