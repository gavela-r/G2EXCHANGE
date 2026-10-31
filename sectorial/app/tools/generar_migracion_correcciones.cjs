// Genera la migración de resolución de conflictos a partir del registro de correcciones
// (tools/diagnostico_conflictos.cjs --ledger). NO SE EJECUTA: deja preparados
//  - server/sql/31_pcv_resolucion_conflictos.sql (+ .rollback.sql): esquema (tabla de auditoría), en el repositorio;
//  - <dirPrivado>/31_datos_<sha>.sql y 31_datos_<sha>.rollback.sql: sentencias por celda (contienen importes, por
//    eso quedan fuera del repositorio).
// Garantías de las sentencias de datos:
//  - nunca se borra un PCV; el valor anterior queda en pcv_correccion_auditoria;
//  - cada UPDATE exige que el importe actual siga siendo el antiguo (WHERE id=? AND importe=?): idempotente y sin
//    pisar cambios posteriores; la verificación posterior (ROW_COUNT) se comprueba en el procedimiento;
//  - la resolución se registra como evidencia nueva CONFLICT_RESOLVED (regla y versión); el CONFLICT_PRESERVED
//    original se conserva;
//  - lotes de 500 celdas por transacción; el rollback restaura importes y elimina sólo las evidencias generadas.
// Uso: node tools/generar_migracion_correcciones.cjs <ledger.ndjson> <dirPrivado>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const q=v=>v===null||v===undefined?'NULL':typeof v==='number'?(Number.isFinite(v)?String(v):'NULL'):"'"+String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
const PROVIDER={US:'SEC_EDGAR',JP:'EDINET'};

const ESQUEMA=`-- 31_pcv_resolucion_conflictos.sql — PREPARADA, NO EJECUTADA.
-- Auditoría de correcciones de PCV derivadas de reglas versionadas (sectorial/app/tools/diagnostico_conflictos.cjs).
-- Requisitos previos: copia verificada (server/scripts/backup-db.cjs + comprobar-restauracion.cjs), recuperadores
-- que escriben en partida_contable_valor detenidos o en pausa, y aprobación explícita.
CREATE TABLE IF NOT EXISTS pcv_correccion_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  informe_id INT NOT NULL,
  concept_code VARCHAR(80) NOT NULL,
  pcv_id INT NULL,
  regla VARCHAR(60) NOT NULL,
  version_regla VARCHAR(20) NOT NULL,
  accion VARCHAR(60) NOT NULL,
  importe_anterior DECIMAL(24,4) NULL,
  importe_nuevo DECIMAL(24,4) NULL,
  evidencia_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revertido_en TIMESTAMP NULL,
  UNIQUE KEY uq_pcv_correccion (ledger_sha256, informe_id, concept_code, pcv_id),
  KEY ix_pcv_correccion_informe (informe_id, concept_code),
  CONSTRAINT fk_pcv_correccion_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Semántica: una celda con CONFLICT_PRESERVED cuenta como certificada sólo si además tiene CONFLICT_RESOLVED de una
-- regla versionada y un resultado certificador (INSERTED / NULL_FILLED / VERIFIED_EXISTING) para el valor vigente.
`;
const ESQUEMA_ROLLBACK=`-- Rollback del esquema 31 (sólo si no quedan correcciones aplicadas sin revertir).
DROP TABLE IF EXISTS pcv_correccion_auditoria;
`;

function generar(ledgerFile,dirPrivado,repoSql){
 const texto=fs.readFileSync(ledgerFile,'utf8'),ledgerSha=sha(texto),filas=texto.split(String.fromCharCode(10)).filter(l=>l.trim());
 fs.mkdirSync(dirPrivado,{recursive:true});
 const datos=path.join(dirPrivado,`31_datos_${ledgerSha.slice(0,12)}.sql`),rollback=datos.replace(/\.sql$/,'.rollback.sql');
 // Escritura por flujo: el registro tiene cientos de miles de celdas.
 const fu=fs.openSync(datos,'w'),fd=fs.openSync(rollback,'w'),hu=crypto.createHash('sha256'),hd=crypto.createHash('sha256');
 const up={push:t=>{fs.writeSync(fu,t+'\n');hu.update(t+'\n');}},down={push:t=>{fs.writeSync(fd,t+'\n');hd.update(t+'\n');}},porRegla={};let lote=0;
 const cab=`-- Generado ${new Date().toISOString()} desde ${path.basename(ledgerFile)} (sha256 ${ledgerSha}). NO EJECUTADO.\n-- Requiere el esquema 31 y los requisitos previos indicados en server/sql/31_pcv_resolucion_conflictos.sql.\nSET autocommit=0;\n`;
 up.push(cab);down.push(cab);
 filas.forEach((linea,i)=>{const r=JSON.parse(linea);
  if(i%500===0){if(i)up.push('COMMIT;');up.push(`START TRANSACTION; -- lote ${++lote}`);}
  porRegla[r.rule]=(porRegla[r.rule]??0)+1;
  const prov=PROVIDER[r.country],base={policy:'PCV_CONFLICT_RESOLUTION_V1',rule:r.rule,ruleVersion:r.ruleVersion,ledgerSha256:ledgerSha,cause:r.cause,candidate:r.candidate,secProof:r.secProof};
  if(r.rule==='US_PERIODO_V1'){
   const cambiar=r.originals.filter(o=>o.id!==null&&o.importe!==null&&o.importe!==r.value);
   for(const o of cambiar){const ev=sha(JSON.stringify({...base,pcv_id:o.id,before:o.importe,after:r.value}));
    up.push(`INSERT IGNORE INTO pcv_correccion_auditoria(ledger_sha256,informe_id,concept_code,pcv_id,regla,version_regla,accion,importe_anterior,importe_nuevo,evidencia_sha256) VALUES(${q(ledgerSha)},${r.informe_id},${q(r.concept)},${o.id},${q(r.rule)},${q(r.ruleVersion)},${q(r.action)},${q(o.importe)},${q(r.value)},${q(ev)});`);
    up.push(`UPDATE partida_contable_valor SET importe=${q(r.value)} WHERE id=${o.id} AND informe_id=${r.informe_id} AND importe=${q(o.importe)};`);
    down.push(`UPDATE partida_contable_valor SET importe=${q(o.importe)} WHERE id=${o.id} AND informe_id=${r.informe_id} AND importe=${q(r.value)};`);
    down.push(`UPDATE pcv_correccion_auditoria SET revertido_en=CURRENT_TIMESTAMP WHERE ledger_sha256=${q(ledgerSha)} AND pcv_id=${o.id} AND revertido_en IS NULL;`);}
   const ver=JSON.stringify({...base,outcome:'VERIFIED_EXISTING',record_ids:r.originals.map(o=>o.id)});
   up.push(`INSERT IGNORE INTO pcv_verification_evidence(informe_id,concept_code,provider,outcome,evidence_hash,evidence_json) VALUES(${r.informe_id},${q(r.concept)},${q(prov)},'VERIFIED_EXISTING',${q(sha(ver))},${q(ver)});`);
   down.push(`DELETE FROM pcv_verification_evidence WHERE informe_id=${r.informe_id} AND concept_code=${q(r.concept)} AND evidence_hash=${q(sha(ver))};`);
  }else{
   up.push(`INSERT IGNORE INTO pcv_correccion_auditoria(ledger_sha256,informe_id,concept_code,pcv_id,regla,version_regla,accion,importe_anterior,importe_nuevo,evidencia_sha256) VALUES(${q(ledgerSha)},${r.informe_id},${q(r.concept)},NULL,${q(r.rule)},${q(r.ruleVersion)},${q(r.action)},NULL,NULL,${q(sha(JSON.stringify(base)))});`);
  }
  const res=JSON.stringify({...base,outcome:'CONFLICT_RESOLVED'});
  up.push(`INSERT IGNORE INTO pcv_verification_evidence(informe_id,concept_code,provider,outcome,evidence_hash,evidence_json) VALUES(${r.informe_id},${q(r.concept)},${q(prov)},'CONFLICT_RESOLVED',${q(sha(res))},${q(res)});`);
  down.push(`DELETE FROM pcv_verification_evidence WHERE informe_id=${r.informe_id} AND concept_code=${q(r.concept)} AND evidence_hash=${q(sha(res))};`);
 });
 up.push('COMMIT;');down.push('COMMIT;');fs.closeSync(fu);fs.closeSync(fd);
 if(repoSql){fs.writeFileSync(path.join(repoSql,'31_pcv_resolucion_conflictos.sql'),ESQUEMA);fs.writeFileSync(path.join(repoSql,'31_pcv_resolucion_conflictos.rollback.sql'),ESQUEMA_ROLLBACK);}
 const manifest={generatedAt:new Date().toISOString(),executed:false,ledger:path.basename(ledgerFile),ledgerSha256:ledgerSha,cells:filas.length,byRule:porRegla,batches:lote,data:{file:path.basename(datos),sha256:hu.digest('hex')},rollback:{file:path.basename(rollback),sha256:hd.digest('hex')}};
 fs.writeFileSync(datos.replace(/\.sql$/,'.manifest.json'),JSON.stringify(manifest,null,2));
 return manifest;
}
module.exports={generar,ESQUEMA};
if(require.main===module){const[ledger,dir]=process.argv.slice(2);if(!ledger||!dir){console.error('Uso: node tools/generar_migracion_correcciones.cjs <ledger.ndjson> <dirPrivado>');process.exit(2);}
 console.log(JSON.stringify(generar(path.resolve(ledger),path.resolve(dir),path.resolve(__dirname,'../../../server/sql')),null,1));}
