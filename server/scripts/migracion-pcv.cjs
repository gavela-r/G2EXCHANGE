const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../../.env')});const mysql=require('mysql2/promise');
(async()=>{const production=process.argv.includes('--production'),target=production?process.env.DB_NAME:process.argv[2];
 if(!production&&!/^g2_recovery_[a-zA-Z0-9_]+$/.test(target||''))throw new Error('Base aislada recovery obligatoria');
 const proofFile=path.resolve(__dirname,'../../private_backups/pcv-migration-test.json');
 if(production){const proof=JSON.parse(fs.readFileSync(proofFile));assert.equal(proof.tested,true);assert.equal(proof.production,process.env.DB_NAME);}
 const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:target});
 try{const [tables]=await c.query('SHOW TABLES');const checks=async()=>{const out={};for(const r of tables){const t=Object.values(r)[0];if(t==='pcv_import_evidence')continue;out[t]=(await c.query('CHECKSUM TABLE `'+t+'`'))[0][0].Checksum;}return out;};const before=await checks();
 const ddl=fs.readFileSync(path.resolve(__dirname,'../sql/16_pcv_import_evidence.sql'),'utf8');await c.query(ddl);await c.query(ddl);assert.deepEqual(await checks(),before);
 const [fk]=await c.query("SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pcv_import_evidence' AND REFERENCED_TABLE_NAME IS NOT NULL");assert.equal(fk.length,1);assert.equal(fk[0].REFERENCED_TABLE_NAME,'informe_financiero');
 if(!production)fs.writeFileSync(proofFile,JSON.stringify({tested:true,production:process.env.DB_NAME,isolated:target,originals_unchanged:true},null,2));console.log(JSON.stringify({target,production,ddl_twice:true,original_tables_unchanged:true,fk_verified:true}));
 }finally{await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
