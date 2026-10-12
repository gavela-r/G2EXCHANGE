const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require('dotenv').config({path:path.resolve(__dirname,'../../.env')});
const mysql=require('mysql2/promise');
const isolated='g2_activation_test_20261012',root=path.resolve(__dirname,'../..'),dir=path.join(root,'private_backups');
const db=()=>mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,dateStrings:true,multipleStatements:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const migration=path.join(root,'server/sql/10_valoracion_reproducible.sql');
async function checksums(c,schema){const [tables]=await c.query('SHOW TABLES FROM `'+schema+'`');const out={};for(const r of tables){const t=Object.values(r)[0];out[t]=(await c.query('CHECKSUM TABLE `'+schema+'`.`'+t+'`'))[0][0].Checksum;assert.notEqual(out[t],null,'Checksum disponible '+t);}return out;}
async function verify(c){const [fk]=await c.query("SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='valuation_execution' AND REFERENCED_TABLE_NAME IS NOT NULL");assert.deepEqual(fk.map(r=>r.REFERENCED_TABLE_NAME).sort(),['instrumento','valuation_run']);assert.equal((await c.query("SELECT COUNT(*) n FROM model_version WHERE version='1.5.1'"))[0][0].n,1);const [cols]=await c.query('SHOW COLUMNS FROM valuation_execution');for(const name of ['input_json','trace_json','output_json'])assert.equal(cols.find(r=>r.Field===name).Type,'longtext');}
(async()=>{const c=await db();try{
 if(!process.argv.includes('--production')){
  const before=await checksums(c,process.env.DB_NAME),copy=await checksums(c,isolated);assert.deepEqual(copy,before,'Restauración íntegra de todas las tablas');
  await c.changeUser({database:isolated});await c.query(fs.readFileSync(migration,'utf8'));await verify(c);await c.query(fs.readFileSync(migration,'utf8'));await verify(c);
  const after=await checksums(c,isolated);for(const t of Object.keys(before))if(t!=='model_version')assert.equal(after[t],before[t],'Migración preserva '+t);
  await c.query(fs.readFileSync(path.join(root,'server/sql/11_rollback_valoracion_reproducible.sql'),'utf8'));await c.query('RENAME TABLE valuation_execution_archived_v1 TO valuation_execution');await verify(c);
  // Historical date repair: actual restored data, all fields compared, transaction rolled back.
  let repair=fs.readFileSync(path.join(root,'server/sql/14_reparacion_fechas_copia.sql'),'utf8');repair=repair.slice(0,repair.indexOf('\nROLLBACK;'));
  await c.query(repair);
  const [columns]=await c.query('SHOW COLUMNS FROM valuation_input_version');const excluded=['id','fecha_fin_periodo','hash_inputs','created_at','fecha_creacion'];
  const same=columns.filter(r=>!excluded.includes(r.Field)).map(r=>`(v.\`${r.Field}\` <=> n.\`${r.Field}\`)`).join(' AND ');
  const [[r]]=await c.query(`SELECT COUNT(*) candidatas,SUM(n.id IS NULL) ausentes,SUM(NOT (${same})) campos_distintos,SUM(NOT(n.fecha_fin_periodo <=> i.fecha_fin_periodo)) fechas_incorrectas,SUM(NOT(n.hash_inputs <=> r.hash_correcto)) hashes_incorrectos FROM valuation_date_repair r JOIN valuation_input_version v ON v.id=r.old_version_id JOIN informe_financiero i ON i.id=v.informe_id AND i.empresa_id=v.empresa_id LEFT JOIN valuation_input_version n ON n.id=r.new_version_id`);
  assert.equal(r.candidatas,88464);for(const k of ['ausentes','campos_distintos','fechas_incorrectas','hashes_incorrectos'])assert.equal(Number(r[k]),0,k);await c.rollback();
  const end=await checksums(c,isolated);assert.equal(end.valuation_input_version,before.valuation_input_version);assert.equal(end.valuation_input_snapshot_detalle,before.valuation_input_snapshot_detalle);
  const report={backup_sha256:hash(path.join(dir,'g2-before-activation-20261012.sql')),migration_sha256:hash(migration),original_checksums:before,restored_all_tables_equal:true,migration_twice:true,foreign_keys:true,rollback_rename_roundtrip:true,date_repair:r,date_repair_rolled_back:true};fs.writeFileSync(path.join(dir,'activacion-ensayo.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }else{
  const evidence=JSON.parse(fs.readFileSync(path.join(dir,'activacion-ensayo.json')));assert.equal(hash(migration),evidence.migration_sha256);assert.equal(hash(path.join(dir,'g2-before-activation-20261012.sql')),evidence.backup_sha256);assert.deepEqual(await checksums(c,process.env.DB_NAME),evidence.original_checksums,'Producción no cambió desde backup');
  await c.query(fs.readFileSync(migration,'utf8'));await verify(c);
  const after=await checksums(c,process.env.DB_NAME);for(const t of Object.keys(evidence.original_checksums))if(t!=='model_version')assert.equal(after[t],evidence.original_checksums[t]);
  fs.writeFileSync(path.join(dir,'activacion-produccion.json'),JSON.stringify({database:process.env.DB_NAME,migration:'10',checked:true,original_tables_unchanged:true,at:new Date().toISOString()},null,2));console.log('Persistencia activada; tablas originales intactas, salvo nuevo model_version.');
 }
}finally{await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
