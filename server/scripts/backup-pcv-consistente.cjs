// Brief global read lock makes dump + verification manifest agree even while
// recovery workers are active. Always releases the lock, including on failure.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const pool=require('../dist/conexion/bd').default;
(async()=>{const c=await pool.getConnection();try{await c.query('FLUSH TABLES WITH READ LOCK');const [tables]=await c.query('SHOW TABLES');const manifest={database:process.env.DB_NAME,observed_at:new Date().toISOString(),tables:{}};
 for(const row of tables){const table=Object.values(row)[0];if(!/^[A-Za-z0-9_]+$/.test(table))throw new Error('Nombre tabla no admitido');const [[count]]=await c.query('SELECT COUNT(*) n FROM `'+table+'`'),[[checksum]]=await c.query('CHECKSUM TABLE `'+table+'`');manifest.tables[table]={rows:Number(count.n),checksum:checksum.Checksum};}
 const r=spawnSync(process.execPath,[path.join(__dirname,'backup-db.cjs')],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Backup falló; no se confirma recuperabilidad');const backup=JSON.parse(r.stdout.trim());manifest.backup=backup;fs.writeFileSync(backup.file+'.manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({backup:backup.file,sha256:backup.sha256,manifest:backup.file+'.manifest.json',tables:tables.length}));
 }finally{await c.query('UNLOCK TABLES').catch(()=>{});c.release();}})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
