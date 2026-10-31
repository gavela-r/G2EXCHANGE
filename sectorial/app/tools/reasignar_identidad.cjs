// Identidad cruzada TW ← JP (migración 32). MySQL SÓLO LECTURA; genera, sin ejecutar, el esquema (repositorio) y las
// sentencias de datos (directorio privado):
//  - Reasigna un instrumento de la bolsa de Tokio y sus informes EDINET de una empresa taiwanesa a su empresa japonesa
//    real SÓLO si la correspondencia es inequívoca: un único emisor en el registro oficial de EDINET con ese código
//    bursátil, una única empresa japonesa con exactamente ese nombre inglés del registro, y (cuando consta) el código
//    EDINET de la evidencia de los informes igual al del registro.
//  - Si la empresa japonesa ya tiene un informe del mismo tipo y cierre, ese documento no se mueve: queda en cuarentena.
//  - Todo lo no reasignable queda en cuarentena (informe_identidad_cuarentena). Nada se borra.
// Cada UPDATE exige el empresa_id anterior y queda auditado; el rollback lo restaura.
// Uso: G2_PROJECT_ROOT=<proyecto> node tools/reasignar_identidad.cjs <Edinetcode.zip> <dirPrivado>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{database,project}=require('../runtime.cjs');
const srv=p=>require(path.resolve(__dirname,'../../../server/node_modules',p));
const{decodificarRegistroEdinet,leerRegistroEdinetCsv}=require(path.resolve(__dirname,'../../../server/dist/src/pcv/edinetRegistro'));
const norm=v=>String(v??'').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');

const ESQUEMA=`-- 32_informe_identidad_cuarentena.sql
-- Identidad cruzada: documentos EDINET de emisores japoneses asignados a empresas de Taiwán por la colisión de código
-- bursátil (instrumentos taiwaneses creados en la bolsa de Tokio). Nada se borra.
CREATE TABLE IF NOT EXISTS informe_identidad_cuarentena (
  informe_id INT NOT NULL PRIMARY KEY,
  empresa_id INT NOT NULL,
  pais_empresa CHAR(2) NOT NULL,
  fuente_informe VARCHAR(40) NOT NULL,
  identificador_fuente VARCHAR(255) NULL,
  motivo VARCHAR(80) NOT NULL,
  lote_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  detectado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cuarentena_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS identidad_reasignacion_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lote_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  entidad ENUM('instrumento','informe') NOT NULL,
  entidad_id INT NOT NULL,
  empresa_anterior INT NOT NULL,
  empresa_nueva INT NOT NULL,
  edinet_code CHAR(6) NOT NULL,
  criterio VARCHAR(80) NOT NULL,
  aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revertido_en TIMESTAMP NULL,
  KEY ix_reasignacion (lote_sha256, entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`;
const ESQUEMA_ROLLBACK=`-- Rollback del esquema 32 (sólo tras revertir los datos).
DROP TABLE IF EXISTS identidad_reasignacion_auditoria;
DROP TABLE IF EXISTS informe_identidad_cuarentena;
`;

async function main(zipFile,dir){
 const AdmZip=srv('adm-zip'),zip=new AdmZip(zipFile),csv=zip.getEntries().find(e=>/\.csv$/i.test(e.entryName));
 const registro=leerRegistroEdinetCsv(decodificarRegistroEdinet(csv.getData()));
 const porCodigo=new Map();for(const r of registro)if(r.securityCode)(porCodigo.get(r.securityCode)??porCodigo.set(r.securityCode,[]).get(r.securityCode)).push(r);
 const pool=database(),c=await pool.getConnection();let inst,infs,jp,jpInf,ev;
 try{await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  [inst]=await c.query(`SELECT i.id,i.ticker,i.empresa_id FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id JOIN mercado m ON m.id=i.mercado_id WHERE p.codigo_iso='TW' AND UPPER(m.nombre_bolsa)='TOKYO STOCK EXCHANGE'`);
  [infs]=await c.query(`SELECT i.id,i.empresa_id,i.tipo_periodo,DATE_FORMAT(i.fecha_fin_periodo,'%Y-%m-%d') fin,i.identificador_fuente,i.fuente FROM informe_financiero i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='TW' AND i.fuente NOT IN ('FINMIND','MOPS')`);
  [jp]=await c.query(`SELECT e.id,e.nombre_empresa FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='JP'`);
  [jpInf]=await c.query(`SELECT i.empresa_id,i.tipo_periodo,DATE_FORMAT(i.fecha_fin_periodo,'%Y-%m-%d') fin FROM informe_financiero i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='JP'`);
  [ev]=await c.query(`SELECT DISTINCT v.informe_id,JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.context.identity.edinetCode')) ec FROM pcv_verification_evidence v JOIN informe_financiero i ON i.id=v.informe_id JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='TW' AND v.provider LIKE 'EDINET%'`);
  await c.rollback();}finally{c.release();await pool.end();}
 const jpPorNombre=new Map();for(const e of jp)(jpPorNombre.get(norm(e.nombre_empresa))??jpPorNombre.set(norm(e.nombre_empresa),[]).get(norm(e.nombre_empresa))).push(e.id);
 const jpTiene=new Set(jpInf.map(r=>r.empresa_id+'|'+r.tipo_periodo+'|'+r.fin)),evCodigo=new Map();for(const r of ev)if(r.ec&&r.ec!=='null')(evCodigo.get(r.informe_id)??evCodigo.set(r.informe_id,new Set()).get(r.informe_id)).add(r.ec);
 const infsPorEmpresa=new Map();for(const r of infs)(infsPorEmpresa.get(r.empresa_id)??infsPorEmpresa.set(r.empresa_id,[]).get(r.empresa_id)).push(r);
 const plan={instrumentos:[],informes:[],cuarentena:[]},motivos={},asignada=new Set();
 for(const i of inst){
  const regs=[...new Set([...(porCodigo.get(String(i.ticker)+'0')??[]),...(porCodigo.get(String(i.ticker))??[])])];
  const empresaInfs=infsPorEmpresa.get(i.empresa_id)??[];
  const fallo=m=>{motivos[m]=(motivos[m]??0)+1;for(const r of empresaInfs)plan.cuarentena.push({...r,motivo:m});};
  if(regs.length!==1){fallo(regs.length?'REGISTRO_EDINET_AMBIGUO':'SIN_EMISOR_EN_REGISTRO_EDINET');continue;}
  const R=regs[0],cands=jpPorNombre.get(norm(R.englishName))??[];
  if(cands.length!==1){fallo(cands.length?'VARIAS_EMPRESAS_JP_CON_ESE_NOMBRE':'SIN_EMPRESA_JP_CON_NOMBRE_DEL_REGISTRO');continue;}
  if(empresaInfs.some(r=>evCodigo.has(r.id)&&![...evCodigo.get(r.id)].every(x=>x===R.edinetCode))){fallo('CODIGO_EDINET_DE_EVIDENCIA_DISTINTO');continue;}
  const J=cands[0];if(asignada.has(J)){fallo('EMPRESA_JP_YA_ASIGNADA_A_OTRO_INSTRUMENTO');continue;}asignada.add(J);
  plan.instrumentos.push({id:i.id,de:i.empresa_id,a:J,edinetCode:R.edinetCode,ticker:i.ticker});motivos.REASIGNADO=(motivos.REASIGNADO??0)+1;
  for(const r of empresaInfs){if(jpTiene.has(J+'|'+r.tipo_periodo+'|'+r.fin))plan.cuarentena.push({...r,motivo:'DUPLICA_INFORME_DE_LA_EMPRESA_JP'});else plan.informes.push({id:r.id,de:r.empresa_id,a:J,edinetCode:R.edinetCode});}
 }
 const cubiertos=new Set([...plan.informes.map(r=>r.id),...plan.cuarentena.map(r=>r.id)]);
 for(const r of infs)if(!cubiertos.has(r.id))plan.cuarentena.push({...r,motivo:'SIN_INSTRUMENTO_DE_TOKIO_ASOCIADO'});
 const L=crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex'),q=v=>v===null||v===undefined?'NULL':"'"+String(v).replace(/'/g,"''")+"'";
 const up=[`-- Migración 32 (datos), lote ${L}. Generado ${new Date().toISOString()}. Requiere el esquema 32.`,'SET autocommit=0;','START TRANSACTION;'],down=[`-- Rollback de los datos de la migración 32, lote ${L}.`,'SET autocommit=0;','START TRANSACTION;'];
 for(const x of plan.instrumentos){up.push(`INSERT INTO identidad_reasignacion_auditoria(lote_sha256,entidad,entidad_id,empresa_anterior,empresa_nueva,edinet_code,criterio) SELECT ${q(L)},'instrumento',id,empresa_id,${x.a},${q(x.edinetCode)},'REGISTRO_EDINET_CODIGO_Y_NOMBRE_UNICOS' FROM instrumento WHERE id=${x.id} AND empresa_id=${x.de};`);up.push(`UPDATE instrumento SET empresa_id=${x.a} WHERE id=${x.id} AND empresa_id=${x.de};`);}
 for(const x of plan.informes){up.push(`INSERT INTO identidad_reasignacion_auditoria(lote_sha256,entidad,entidad_id,empresa_anterior,empresa_nueva,edinet_code,criterio) SELECT ${q(L)},'informe',id,empresa_id,${x.a},${q(x.edinetCode)},'REGISTRO_EDINET_CODIGO_Y_NOMBRE_UNICOS' FROM informe_financiero WHERE id=${x.id} AND empresa_id=${x.de};`);up.push(`UPDATE informe_financiero SET empresa_id=${x.a} WHERE id=${x.id} AND empresa_id=${x.de};`);}
 for(const x of plan.cuarentena)up.push(`INSERT IGNORE INTO informe_identidad_cuarentena(informe_id,empresa_id,pais_empresa,fuente_informe,identificador_fuente,motivo,lote_sha256) VALUES(${x.id},${x.empresa_id},'TW',${q(x.fuente)},${q(x.identificador_fuente)},${q(x.motivo)},${q(L)});`);
 up.push('COMMIT;');
 down.push(`UPDATE instrumento t JOIN identidad_reasignacion_auditoria a ON a.entidad='instrumento' AND a.entidad_id=t.id SET t.empresa_id=a.empresa_anterior WHERE a.lote_sha256=${q(L)} AND a.revertido_en IS NULL AND t.empresa_id=a.empresa_nueva;`);
 down.push(`UPDATE informe_financiero t JOIN identidad_reasignacion_auditoria a ON a.entidad='informe' AND a.entidad_id=t.id SET t.empresa_id=a.empresa_anterior WHERE a.lote_sha256=${q(L)} AND a.revertido_en IS NULL AND t.empresa_id=a.empresa_nueva;`);
 down.push(`UPDATE identidad_reasignacion_auditoria SET revertido_en=CURRENT_TIMESTAMP WHERE lote_sha256=${q(L)} AND revertido_en IS NULL;`,`DELETE FROM informe_identidad_cuarentena WHERE lote_sha256=${q(L)};`,'COMMIT;');
 fs.mkdirSync(dir,{recursive:true});const base=path.join(dir,`32_datos_${L.slice(0,12)}`);
 fs.writeFileSync(base+'.sql',up.join('\n')+'\n');fs.writeFileSync(base+'.rollback.sql',down.join('\n')+'\n');
 const sqlDir=path.resolve(__dirname,'../../../server/sql');fs.writeFileSync(path.join(sqlDir,'32_informe_identidad_cuarentena.sql'),ESQUEMA);fs.writeFileSync(path.join(sqlDir,'32_informe_identidad_cuarentena.rollback.sql'),ESQUEMA_ROLLBACK);
 const resumen={lote:L,instrumentosTW_Tokio:inst.length,instrumentosReasignados:plan.instrumentos.length,informesReasignados:plan.informes.length,informesEnCuarentena:plan.cuarentena.length,porMotivoInstrumento:motivos,cuarentenaPorMotivo:plan.cuarentena.reduce((a,x)=>(a[x.motivo]=(a[x.motivo]??0)+1,a),{}),archivos:{datos:base+'.sql',rollback:base+'.rollback.sql'}};
 fs.writeFileSync(base+'.manifest.json',JSON.stringify(resumen,null,2));return resumen;
}
if(require.main===module){const[zip,dir]=process.argv.slice(2);if(!zip||!dir){console.error('Uso: node tools/reasignar_identidad.cjs <Edinetcode.zip> <dirPrivado>');process.exit(2);}
 main(path.resolve(zip),path.resolve(dir)).then(r=>console.log(JSON.stringify(r,null,1))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
