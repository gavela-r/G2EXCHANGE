// A consistent SQL transaction, restored in isolation, without stopping workers.
// This deliberately does not claim to align mutable checkpoints/provider files.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),priv=path.join(root,'private_backups');require('dotenv').config({path:path.join(root,'.env')});
function run(file,args,env={}){const r=spawnSync(process.execPath,[path.join(__dirname,file),...args],{cwd:root,env:{...process.env,...env},encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});if(r.status!==0)throw Error('LIVE_BACKUP_STEP_FAILED_'+file);return r.stdout;}
async function main(){
 if(!process.argv.includes('--write-private-backup'))throw Error('EXPLICIT_PRIVATE_BACKUP_FLAG_REQUIRED');
 const stamp=new Date().toISOString().replace(/\D/g,''),database='g2_recovery_live_'+stamp,started_at=new Date().toISOString(),b=JSON.parse(run('backup-db.cjs',[]).trim());
 run('restaurar-db.cjs',[b.file,database]);const integrity=path.join(priv,'live-integrity-'+stamp+'.json');
 run('verificar-pcv-integridad.cjs',['g2_recovery_85_initial_20261029','--output',integrity],{DB_NAME:database});
 const replay=JSON.parse(run('../dist/src/valoracion/replay.js',['533'],{DB_NAME:database}).trim());if(replay.reproduced!==true)throw Error('RESTORED_LIVE_REPLAY_FAILED');
 const mysql=require('../node_modules/mysql2/promise'),pool=mysql.createPool({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database});let correction,tables,corrected_kpi_revalidation;
 try{[tables]=await pool.query('SHOW TABLES');[[correction]]=await pool.query("SELECT COUNT(*) operations,COUNT(DISTINCT e.record_id) kpi_records,SUM(k.valor IS NULL) currently_null FROM pcv_import_evidence e JOIN kpi_financiero_informe k ON k.id=e.record_id WHERE e.provider='CONTROL_PRERREQUISITOS' AND e.record_type='KPI'");corrected_kpi_revalidation=await require('./pcv-verificar-kpi-corregidos.cjs').verificarKpiCorregidos(pool);}finally{await pool.end();}
 if(Number(correction.operations)!==4390||Number(correction.kpi_records)!==4390)throw Error('CORRECTION_4390_NOT_PRESERVED_IN_RESTORED_SQL');
 const proof={started_at,created_at:new Date().toISOString(),backup:b.file,backup_sha256:b.sha256,bytes:b.bytes,database,tables:tables.length,sql_transaction_consistent:true,restored_successfully:true,integrity_errors:0,integrity_proof:integrity,correction,corrected_kpi_revalidation,run_533_reproduced:true,workers_stopped:false,checkpoint_alignment:false,provider_env_included:false,scope:'SQL snapshot after KPI correction; existing aligned portable package remains separate.'};
 fs.writeFileSync(b.file+'.live.validation.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
