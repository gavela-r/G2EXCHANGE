/* Nunca escribe en DB_NAME. Copia segura para integración; no es un backup de producción. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
require('../node_modules/dotenv').config({path:path.join(root,'.env')});
const mysql=require('../node_modules/mysql2/promise');
const target=process.env.CAPITAL_DB_NAME || 'g2_capital_dev_20261029';
function checkTarget(){if(!/^g2_capital_dev_[a-zA-Z0-9_]+$/.test(target)||target===process.env.DB_NAME)throw Error('Destino de desarrollo obligatorio y distinto de la base operativa');}
const options=()=>({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,dateStrings:true,timezone:'Z',connectTimeout:5000});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function migrate(c){
 checkTarget(); const [[row]]=await c.query('SELECT DATABASE() db');if(row.db!==target)throw Error('Migración fuera de copia de desarrollo');
 const text=fs.readFileSync(path.join(root,'server/sql/20_capital_v2.sql'),'utf8');
 const statements=text.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
 await c.query(statements[0]); const [existing]=await c.query('SELECT * FROM capital_schema_version WHERE version=?',['2.0.0']);
 if(existing.length&&existing[0].migration_hash!==sha(text))throw Error('Migración aplicada con otra huella');
 let applied=false;
 if(!existing.length){for(const q of statements.slice(1))await c.query(q);await c.query('INSERT INTO capital_schema_version(version,migration_hash) VALUES (?,?)',['2.0.0',sha(text)]);applied=true;}
 const second=fs.readFileSync(path.join(root,'server/sql/21_capital_identidad.sql'),'utf8');
 const [v2]=await c.query('SELECT * FROM capital_schema_version WHERE version=?',['2.1.0']);
 if(v2.length&&v2[0].migration_hash!==sha(second))throw Error('Migración de identidad aplicada con otra huella');
 if(!v2.length){
 const [dups]=await c.query('SELECT mercado_id,ticker,COUNT(*) n FROM instrumento GROUP BY mercado_id,ticker HAVING COUNT(*)>1 LIMIT 1');if(dups.length)throw Error('Duplicados por mercado: no cambiar índices');
 const [indexes]=await c.query('SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',['instrumento']);const names=new Set(indexes.map(x=>x.INDEX_NAME));
 const sql=second.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);await c.query(sql[0]);
 if(!names.has('uq_instrument_market_ticker'))await c.query(sql[1]);
 if(!names.has('ix_instrument_ticker_lookup'))await c.query(sql[2]);
 if(names.has('ticker'))await c.query(sql[3]);
 await c.query('INSERT INTO capital_schema_version(version,migration_hash) VALUES (?,?)',['2.1.0',sha(second)]);applied=true;
 }
 const third=fs.readFileSync(path.join(root,'server/sql/22_capital_model_version.sql'),'utf8'),[v3]=await c.query('SELECT * FROM capital_schema_version WHERE version=?',['2.2.0']);
 if(v3.length&&v3[0].migration_hash!==sha(third))throw Error('Migración de versión aplicada con otra huella');
 if(!v3.length){
 const qs=third.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);await c.query(qs[0]);
 const [[col]]=await c.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='capital_analysis' AND COLUMN_NAME='model_version_id'");if(!col.n)await c.query(qs[1]);
 const [[fk]]=await c.query("SELECT COUNT(*) n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='fk_cap_analysis_model'");if(!fk.n)await c.query(qs[2]);
 await c.query('INSERT INTO capital_schema_version(version,migration_hash) VALUES (?,?)',['2.2.0',sha(third)]);applied=true;
 }
 const fourth=fs.readFileSync(path.join(root,'server/sql/23_capital_json_exacto.sql'),'utf8'),[v4]=await c.query('SELECT * FROM capital_schema_version WHERE version=?',['2.3.0']);
 if(v4.length){if(v4[0].migration_hash!==sha(fourth))throw Error('Migración de JSON exacto aplicada con otra huella');return applied;}
 const capture=async()=>{const [a]=await c.query('SELECT id,CAST(payload_json AS CHAR) payload_text,SHA2(CAST(payload_json AS CHAR),256) digest FROM capital_analysis ORDER BY id');const [m]=await c.query('SELECT id,CAST(calibration_json AS CHAR) payload_text,SHA2(CAST(calibration_json AS CHAR),256) digest FROM capital_methodology ORDER BY id');return {analyses:a,methods:m};};
 const before=await capture(),dir=path.join(root,'valuation_engine/research/coste_capital/fase3/evidencias');fs.mkdirSync(dir,{recursive:true});const backup=path.join(dir,'migration23-'+target+'-'+Date.now()+'.local.json');
 const [[aDdl]]=await c.query('SHOW CREATE TABLE capital_analysis'),[[mDdl]]=await c.query('SHOW CREATE TABLE capital_methodology');fs.writeFileSync(backup,JSON.stringify({at:new Date().toISOString(),database:target,ddl:[aDdl['Create Table'],mDdl['Create Table']],before},null,2),{flag:'wx'});
 const q4=fourth.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
 const [[ac]]=await c.query("SELECT DATA_TYPE type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='capital_analysis' AND COLUMN_NAME='payload_json'");if(ac.type!=='longtext')await c.query(q4[0]);
 const [[ach]]=await c.query("SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_cap_analysis_json_exact'");if(!ach.n)await c.query(q4[1]);
 const [[enc]]=await c.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='capital_analysis' AND COLUMN_NAME='payload_encoding_version'");if(!enc.n)await c.query(q4[2]);
 const [[mc]]=await c.query("SELECT DATA_TYPE type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='capital_methodology' AND COLUMN_NAME='calibration_json'");if(mc.type!=='longtext')await c.query(q4[3]);
 const [[mch]]=await c.query("SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_cap_method_json_exact'");if(!mch.n)await c.query(q4[4]);
 const after=await capture();if(sha(JSON.stringify(before))!==sha(JSON.stringify(after)))throw Error('CONCILIACION_MIGRACION_23_DIFIERE: conservar backup; no marcar migración aplicada');
 await c.query('INSERT INTO capital_schema_version(version,migration_hash) VALUES (?,?)',['2.3.0',sha(fourth)]);
 fs.writeFileSync(path.join(dir,'migration23-'+target+'-verificada.json'),JSON.stringify({at:new Date().toISOString(),database:target,analysesPreserved:before.analyses.length,methodsPreserved:before.methods.length,byteEquality:true,digest:sha(JSON.stringify(before)),backup:path.basename(backup)},null,2));return true;
}
async function main(){checkTarget();const c=await mysql.createConnection(options());let src;
 try{
 if(process.argv.includes('--create')||process.argv.includes('--resume')){
  src=await mysql.createConnection({...options(),database:process.env.DB_NAME});
  await src.query('SET SESSION TRANSACTION READ ONLY');await src.query('SET SESSION MAX_EXECUTION_TIME=2500');
  const [[exists]]=await c.query('SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[target]);
  if(exists.n&&!process.argv.includes('--resume'))throw Error('La copia ya existe: no sobrescribir; usar --resume o --migrate');
  const [tables]=await src.query('SHOW FULL TABLES WHERE Table_type="BASE TABLE"');const names=tables.map(x=>Object.values(x)[0]);
  const ddl=[];for(const n of names){const [[v]]=await src.query('SHOW CREATE TABLE `'+n+'`');ddl.push(v['Create Table']);}
  if(!exists.n)await c.query('CREATE DATABASE `'+target+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');await c.changeUser({database:target});
  await c.query('SET FOREIGN_KEY_CHECKS=0');for(const q of ddl)await c.query(q.replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS '));await c.query('SET FOREIGN_KEY_CHECKS=1');
  // Copia completa de dimensiones y ejecuciones congeladas; estados sólo de sus empresas.
  const [firms]=await src.query('SELECT empresa_id FROM valuation_run UNION SELECT empresa_id FROM valuation_input_snapshot'); const ids=firms.map(x=>x.empresa_id);
  async function copy(t,where='',params=[]){const [rows]=await src.query({sql:'SELECT * FROM `'+t+'` '+where,values:params,timeout:4000});if(!rows.length)return 0;
   const keys=Object.keys(rows[0]);for(let i=0;i<rows.length;i+=100)await c.query('INSERT IGNORE INTO `'+t+'` ('+keys.map(k=>'`'+k+'`').join(',')+') VALUES ?',[rows.slice(i,i+100).map(r=>keys.map(k=>r[k]))]);return rows.length;}
  const counts={};await c.query('SET FOREIGN_KEY_CHECKS=0');
  for(const t of ['pais','sector','mercado','model_version','taxonomia_concepto','coste_capital_referencia','rating_sintetico','empresa','instrumento'])counts[t]=await copy(t);
  for(const t of ['informe_financiero','valuation_input_version','classification_evidence','financial_report_evidence'])counts[t]=await copy(t,'WHERE empresa_id IN (?)',[ids]).catch(async e=>{if(e.code!=='ER_BAD_FIELD_ERROR')throw e;return copy(t,'WHERE informe_id IN (SELECT id FROM informe_financiero WHERE empresa_id IN (?))',[ids]);});
  const [reports]=await c.query('SELECT id FROM informe_financiero');
  for(const t of ['partida_contable_valor','pcv_import_evidence','pcv_verification_evidence']){
   counts[t]=0;for(let j=0;j<reports.length;j+=20){counts[t]+=await copy(t,'WHERE informe_id IN (?)',[reports.slice(j,j+20).map(x=>x.id)]);await new Promise(r=>setTimeout(r,20));}
   console.log(JSON.stringify({copied:t,rows:counts[t]}));
  }
  for(const t of ['valuation_input_snapshot','valuation_run','valuation_execution','valuation_input_snapshot_detalle','valuation_run_parametros','valuation_run_resultado','cotizacion_diaria','evento_corporativo'])counts[t]=await copy(t);
  await c.query('SET FOREIGN_KEY_CHECKS=1');
  fs.mkdirSync(path.join(root,'valuation_engine/research/coste_capital/fase3/evidencias'),{recursive:true});
  fs.writeFileSync(path.join(root,'valuation_engine/research/coste_capital/fase3/evidencias/copia.json'),JSON.stringify({at:new Date().toISOString(),sourceReadOnly:true,target,counts,schemaHash:sha(ddl.join('\n')),scope:'dimensiones completas; informes de empresas con runs; no es réplica completa'},null,2));
 }else await c.changeUser({database:target});
 const applied=await migrate(c);console.log(JSON.stringify({target,migrationApplied:applied}));
 }finally{await src?.end();await c.end();}}
module.exports={options,migrate,target,checkTarget};
if(require.main===module)main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
