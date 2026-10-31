// Genera la migración 31 (resolución de conflictos con reglas versionadas) a partir del registro de correcciones
// (tools/diagnostico_conflictos.cjs --ledger). Produce:
//  - server/sql/31_pcv_resolucion_conflictos.sql (+ .rollback.sql): esquema (tabla de auditoría), en el repositorio;
//  - <dirPrivado>/31_datos_<sha>.sql, .rollback.sql y .manifest.json: sentencias de datos (contienen importes, fuera
//    del repositorio).
// Garantías de las sentencias de datos (probadas en una copia aislada antes de aplicarlas en la base operativa):
//  - Nunca se borra un PCV. Antes de cada UPDATE se audita el importe anterior, y sólo si la fila sigue teniendo ese
//    importe; el UPDATE exige además id, informe e importe antiguo: idempotente y sin pisar cambios posteriores.
//  - Las evidencias nuevas se insertan sólo si TODAS las filas de la celda contienen ya el valor acreditado.
//  - VERIFIED_EXISTING se construye a partir de la propia fila CONFLICT_PRESERVED del verificador (mismo candidato y
//    contexto: moneda, perímetro, fechas, identidad), con record_ids y un bloque `correction` (regla, versión,
//    sha256 del registro y hash del conflicto que resuelve).
//  - CONFLICT_RESOLVED referencia el conflicto (`resolves` = evidence_hash). No certifica por sí mismo: el adaptador y
//    la cobertura siguen exigiendo una prueba certificadora compatible con el valor vigente.
//  - El CONFLICT_PRESERVED original se conserva. Lotes de 500 celdas por transacción.
//  - Rollback por conjuntos: restaura importes auditados (sólo si siguen siendo el valor corregido) y elimina las
//    evidencias marcadas con el sha256 del registro.
// Uso: node tools/generar_migracion_correcciones.cjs <ledger.ndjson> <dirPrivado>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const q=v=>v===null||v===undefined?'NULL':typeof v==='number'?(Number.isFinite(v)?String(v):'NULL'):"'"+String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
const REGLAS_VALIDAS=new Set(['US_PERIODO_V1','JP_RESUMEN_MISMO_DOC_V1','JP_SIGNO_CANONICO_V1']);

const ESQUEMA=`-- 31_pcv_resolucion_conflictos.sql
-- Auditoría de correcciones de PCV derivadas de reglas versionadas (sectorial/app/tools/diagnostico_conflictos.cjs).
-- Requisitos previos de los datos: copia verificada, ensayo y rollback en una copia aislada, y pausa de los procesos
-- que escriben partida_contable_valor durante la aplicación.
CREATE TABLE IF NOT EXISTS pcv_correccion_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  informe_id INT NOT NULL,
  concept_code VARCHAR(80) NOT NULL,
  pcv_id INT NOT NULL DEFAULT 0,
  regla VARCHAR(60) NOT NULL,
  version_regla VARCHAR(20) NOT NULL,
  accion VARCHAR(60) NOT NULL,
  importe_anterior DECIMAL(24,4) NULL,
  importe_nuevo DECIMAL(24,4) NULL,
  conflicto_evidence_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revertido_en TIMESTAMP NULL,
  -- Sin clave única: la idempotencia la garantizan los UPDATE condicionados (importe antiguo) y la clave única de las
  -- evidencias; así una reaplicación tras un rollback vuelve a quedar auditada.
  KEY ix_pcv_correccion_ledger (ledger_sha256, informe_id, concept_code),
  KEY ix_pcv_correccion_pcv (pcv_id),
  CONSTRAINT fk_pcv_correccion_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Semántica: una celda con CONFLICT_PRESERVED deja de bloquear sólo si un CONFLICT_RESOLVED de una regla versionada
-- referencia ese conflicto (resolves = evidence_hash) y además existe una prueba certificadora para el valor vigente.
`;
const ESQUEMA_ROLLBACK=`-- Rollback del esquema 31 (sólo tras revertir los datos: no deben quedar correcciones sin revertido_en).
DROP TABLE IF EXISTS pcv_correccion_auditoria;
`;

function sentencias(r,L){
 const tc=`(SELECT id FROM taxonomia_concepto WHERE concepto_estandar=${q(r.concept)})`;
 const limpia=r.rule==='JP_SIGNO_CANONICO_V1'
  ?`NOT EXISTS (SELECT 1 FROM partida_contable_valor p WHERE p.informe_id=${r.informe_id} AND p.concepto_estandar_id=${tc} AND p.importe IS NOT NULL AND ABS(p.importe)<>ABS(${q(r.value)}))`
  :`NOT EXISTS (SELECT 1 FROM partida_contable_valor p WHERE p.informe_id=${r.informe_id} AND p.concepto_estandar_id=${tc} AND p.importe IS NOT NULL AND p.importe<>${q(r.value)})`;
 const corr=`JSON_OBJECT('ledgerSha256',${q(L)},'rule',${q(r.rule)},'ruleVersion',${q(r.ruleVersion)},'action',${q(r.action)},'resolves',v.evidence_hash)`;
 const fuente=`FROM pcv_verification_evidence v WHERE v.id=${r.evidence_id} AND v.informe_id=${r.informe_id} AND v.concept_code=${q(r.concept)} AND v.outcome='CONFLICT_PRESERVED' AND ${limpia}`;
 const out=[];
 if(r.rule==='US_PERIODO_V1'){
  for(const o of r.originals.filter(o=>o.id!==null&&o.importe!==null&&o.importe!==r.value)){
   out.push(`INSERT IGNORE INTO pcv_correccion_auditoria(ledger_sha256,informe_id,concept_code,pcv_id,regla,version_regla,accion,importe_anterior,importe_nuevo,conflicto_evidence_hash) SELECT ${q(L)},${r.informe_id},${q(r.concept)},${o.id},${q(r.rule)},${q(r.ruleVersion)},${q(r.action)},p.importe,${q(r.value)},${q(r.evidence_hash)} FROM partida_contable_valor p WHERE p.id=${o.id} AND p.informe_id=${r.informe_id} AND p.importe=${q(o.importe)};`);
   out.push(`UPDATE partida_contable_valor SET importe=${q(r.value)} WHERE id=${o.id} AND informe_id=${r.informe_id} AND importe=${q(o.importe)};`);
  }
  const ids=JSON.stringify(r.originals.filter(o=>o.id!==null).map(o=>o.id));
  out.push(`INSERT IGNORE INTO pcv_verification_evidence(informe_id,concept_code,provider,outcome,evidence_hash,evidence_json) SELECT v.informe_id,v.concept_code,v.provider,'VERIFIED_EXISTING',SHA2(CONCAT('PCV_CORRECTION_V1|VE|',v.evidence_hash,'|',${q(L)}),256),JSON_SET(JSON_REMOVE(v.evidence_json,'$.evidence.originals','$.evidence.matching_ids'),'$.outcome','VERIFIED_EXISTING','$.evidence.record_ids',CAST(${q(ids)} AS JSON),'$.correction',${corr}) ${fuente};`);
 }else{
  out.push(`INSERT IGNORE INTO pcv_correccion_auditoria(ledger_sha256,informe_id,concept_code,pcv_id,regla,version_regla,accion,importe_anterior,importe_nuevo,conflicto_evidence_hash) SELECT ${q(L)},v.informe_id,v.concept_code,0,${q(r.rule)},${q(r.ruleVersion)},${q(r.action)},NULL,NULL,v.evidence_hash ${fuente} AND NOT EXISTS (SELECT 1 FROM pcv_correccion_auditoria a WHERE a.ledger_sha256=${q(L)} AND a.informe_id=${r.informe_id} AND a.concept_code=${q(r.concept)} AND a.revertido_en IS NULL);`);
 }
 // Una celda puede tener varios CONFLICT_PRESERVED (una por pasada del verificador): se resuelve cada uno, sólo si su
 // candidato es el valor acreditado (en valor absoluto para la regla de signo).
 const cand=`CAST(JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.evidence.candidate.importe')) AS DECIMAL(24,4))`;
 const mismoCandidato=r.rule==='JP_SIGNO_CANONICO_V1'?`ABS(${cand})=ABS(${q(r.value)})`:`${cand}=${q(r.value)}`;
 out.push(`INSERT IGNORE INTO pcv_verification_evidence(informe_id,concept_code,provider,outcome,evidence_hash,evidence_json) SELECT v.informe_id,v.concept_code,v.provider,'CONFLICT_RESOLVED',SHA2(CONCAT('PCV_CORRECTION_V1|CR|',v.evidence_hash,'|',${q(L)}),256),JSON_OBJECT('policy','PCV_CONFLICT_RESOLUTION_V1','outcome','CONFLICT_RESOLVED','resolves',v.evidence_hash,'context',JSON_EXTRACT(v.evidence_json,'$.context'),'correction',${corr}) FROM pcv_verification_evidence v WHERE v.informe_id=${r.informe_id} AND v.concept_code=${q(r.concept)} AND v.outcome='CONFLICT_PRESERVED' AND ${mismoCandidato} AND ${limpia};`);
 return out;
}

function generar(ledgerFile,dirPrivado,repoSql){
 const texto=fs.readFileSync(ledgerFile,'utf8'),L=sha(texto),filas=texto.split(String.fromCharCode(10)).filter(l=>l.trim());
 fs.mkdirSync(dirPrivado,{recursive:true});
 const datos=path.join(dirPrivado,`31_datos_${L.slice(0,12)}.sql`),rollback=datos.replace(/\.sql$/,'.rollback.sql');
 const fu=fs.openSync(datos,'w'),hu=crypto.createHash('sha256'),w=t=>{fs.writeSync(fu,t+'\n');hu.update(t+'\n');},porRegla={},esperado={updates:0,cells:0};let lote=0;
 w(`-- Generado ${new Date().toISOString()} desde ${path.basename(ledgerFile)} (sha256 ${L}).\n-- Requiere el esquema 31. Ejecutar sólo tras el ensayo y rollback en copia aislada.\nSET autocommit=0;`);
 filas.forEach((linea,i)=>{const r=JSON.parse(linea);
  if(!REGLAS_VALIDAS.has(r.rule)||!Number.isInteger(r.evidence_id)||!/^[0-9a-f]{64}$/.test(r.evidence_hash??''))throw Error('Fila de registro inválida: '+i);
  if(i%500===0){if(i)w('COMMIT;');w(`START TRANSACTION; -- lote ${++lote}`);}
  porRegla[r.rule]=(porRegla[r.rule]??0)+1;esperado.cells++;
  if(r.rule==='US_PERIODO_V1')esperado.updates+=r.originals.filter(o=>o.id!==null&&o.importe!==null&&o.importe!==r.value).length;
  for(const s of sentencias(r,L))w(s);
 });
 w('COMMIT;');fs.closeSync(fu);
 const down=`-- Rollback de los datos de la migración 31 para el registro ${L}.
SET autocommit=0;
START TRANSACTION;
UPDATE partida_contable_valor p JOIN pcv_correccion_auditoria a ON a.pcv_id=p.id AND a.informe_id=p.informe_id SET p.importe=a.importe_anterior WHERE a.ledger_sha256='${L}' AND a.revertido_en IS NULL AND a.pcv_id<>0 AND p.importe=a.importe_nuevo;
UPDATE pcv_correccion_auditoria SET revertido_en=CURRENT_TIMESTAMP WHERE ledger_sha256='${L}' AND revertido_en IS NULL;
DELETE FROM pcv_verification_evidence WHERE outcome IN ('VERIFIED_EXISTING','CONFLICT_RESOLVED') AND JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.correction.ledgerSha256'))='${L}';
COMMIT;
`;
 fs.writeFileSync(rollback,down);
 if(repoSql){fs.writeFileSync(path.join(repoSql,'31_pcv_resolucion_conflictos.sql'),ESQUEMA);fs.writeFileSync(path.join(repoSql,'31_pcv_resolucion_conflictos.rollback.sql'),ESQUEMA_ROLLBACK);}
 const manifest={generatedAt:new Date().toISOString(),ledger:path.basename(ledgerFile),ledgerSha256:L,cells:esperado.cells,expectedUpdates:esperado.updates,byRule:porRegla,batches:lote,data:{file:path.basename(datos),sha256:hu.digest('hex')},rollback:{file:path.basename(rollback),sha256:sha(down)}};
 fs.writeFileSync(datos.replace(/\.sql$/,'.manifest.json'),JSON.stringify(manifest,null,2));
 return manifest;
}
module.exports={generar,sentencias,ESQUEMA};
if(require.main===module){const[ledger,dir]=process.argv.slice(2);if(!ledger||!dir){console.error('Uso: node tools/generar_migracion_correcciones.cjs <ledger.ndjson> <dirPrivado>');process.exit(2);}
 console.log(JSON.stringify(generar(path.resolve(ledger),path.resolve(dir),path.resolve(__dirname,'../../../server/sql')),null,1));}
