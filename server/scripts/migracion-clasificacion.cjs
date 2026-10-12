const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');require('dotenv').config({path:path.resolve(__dirname,'../../.env')});const mysql=require('mysql2/promise');
(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:'g2_activation_test_20261012',multipleStatements:true});try{
 const ddl=fs.readFileSync(path.resolve(__dirname,'../sql/15_clasificacion_evidencia.sql'),'utf8');
 const checksum=async()=>Object.fromEntries((await c.query('CHECKSUM TABLE empresa,instrumento,valuation_input_version,valuation_run'))[0].map(r=>[r.Table.split('.').at(-1),r.Checksum]));
 const before=await checksum();await c.query(ddl);await c.query(ddl);assert.deepEqual(await checksum(),before);
 const fk=async()=>{const [rows]=await c.query("SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='classification_evidence' AND REFERENCED_TABLE_NAME IS NOT NULL");assert.deepEqual(rows.map(r=>r.REFERENCED_TABLE_NAME).sort(),['empresa','sector']);};await fk();
 if(process.argv.includes('--production')){await c.changeUser({database:process.env.DB_NAME});const orig=await checksum();await c.query(ddl);await fk();assert.deepEqual(await checksum(),orig);console.log('Migración 15 aplicada: originales intactos, FKs verificadas.');}else console.log('Migración 15 ensayada dos veces en copia aislada.');
}finally{await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
