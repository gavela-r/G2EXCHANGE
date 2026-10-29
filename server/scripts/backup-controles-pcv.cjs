// Private portable bundle. Requires a restored/verified dump and paused workers.
// The bundle CONTAINS CREDENTIALS; never stage, upload or publish it.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),root=path.resolve(__dirname,'../..'),pool=require('../dist/conexion/bd').default;
const {sha256File:streamDigest}=require('./pcv-file-hash.cjs');
(async()=>{const backup=path.resolve(process.argv[2]||'');const relative=path.relative(root,backup);if(!relative.startsWith('private_backups'+path.sep)||path.isAbsolute(relative)||!backup.endsWith('.sql'))throw Error('Dump privado dentro del repositorio obligatorio');
 const manifest=JSON.parse(fs.readFileSync(backup+'.manifest.json')),proof=JSON.parse(fs.readFileSync(backup+'.restored.json'));if(proof.all_tables_equal!==true||await streamDigest(backup)!==manifest.backup.sha256||fs.readFileSync(backup+'.sha256','utf8').trim()!==manifest.backup.sha256||proof.sha256!==manifest.backup.sha256)throw Error('Backup restaurado y hashes verificados obligatorios');
 const directory=path.join(root,'private_backups'),jobDirs=fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('pcv-')&&e.name!=='pcv-provider-http').map(e=>path.join(directory,e.name));
 for(const dir of jobDirs)for(const name of ['checkpoint.json','collect-checkpoint.json']){const file=path.join(dir,name);if(fs.existsSync(file)&&!JSON.parse(fs.readFileSync(file)).done&&!fs.existsSync(path.join(dir,'stop.request')))throw Error('PAUSAR_CHECKPOINT_'+path.basename(dir));}
 const c=await pool.getConnection();try{for(const country of ['US','JP']){const [[l]]=await c.query('SELECT GET_LOCK(?,0) acquired',['G2_PCV_RECOVERY_'+country]);if(!l.acquired)throw Error('WORKER_ACTIVO_'+country);}
 await c.query('FLUSH TABLES WITH READ LOCK');
 const [tables]=await c.query('SHOW TABLES');if(JSON.stringify(tables.map(r=>Object.values(r)[0]).sort())!==JSON.stringify(Object.keys(manifest.tables).sort()))throw Error('ESQUEMA_CAMBIO_DESDE_BACKUP');
 for(const [table,expected] of Object.entries(manifest.tables)){if(!/^[A-Za-z0-9_]+$/.test(table))throw Error('TABLA_INVALIDA');const [[row]]=await c.query('CHECKSUM TABLE `'+table+'`');if(row.Checksum!==expected.checksum)throw Error('BACKUP_ANTERIOR_AL_ESTADO_ACTUAL_'+table);}
 // SEC archives are immutable source evidence. Keep their compressed bytes,
 // bindings and manifests, but omit re-extractable multi-GB JSON directories.
 const jobPaths=jobDirs.flatMap(dir=>path.basename(dir).startsWith('pcv-us-bulk-')?fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&!e.name.endsWith('.partial')).map(e=>path.relative(root,path.join(dir,e.name))):[path.relative(root,dir)]);
 const files=['.env','valuation_engine/archives','valuation_engine/dist','server/dist','server/scripts','server/resultados_valoraciones',relative,relative+'.sha256',relative+'.manifest.json',relative+'.restored.json',...jobPaths];
 if(fs.existsSync(path.join(directory,'copilot-original')))files.push('private_backups/copilot-original');
 const initial='private_backups/g2-2026-10-28T17-58-31-790Z.sql';if(fs.existsSync(path.join(root,initial)))for(const file of [initial,initial+'.sha256'])if(fs.existsSync(path.join(root,file)))files.push(file);
 for(const file of fs.readdirSync(directory).filter(n=>/^pcv-kpi-audit-.*\.json$/.test(n)||/^cobertura-estructural-.*\.json$/.test(n)||['pcv-provider-comparison.json','pcv-integrity-final.json','pcv-pause-manifest.json'].includes(n)))files.push(path.join('private_backups',file));
 // Retain the actual official ZIPs and observed provider responses as well as
 // quota counters. A later API response need not reproduce an earlier hash.
 const quotaDir=path.join(directory,'pcv-provider-http');if(fs.existsSync(quotaDir))files.push('private_backups/pcv-provider-http');
 const present=files.filter(file=>fs.existsSync(path.join(root,file))),stamp=new Date().toISOString().replace(/[:.]/g,'-'),target=path.join(directory,'pcv-recovery-controls-'+stamp+'.tar');if(fs.existsSync(target))throw Error('Archivo destino existente');
 const size=file=>{const s=fs.lstatSync(file);if(s.isSymbolicLink())throw Error('ENLACE_NO_ADMITIDO_EN_BACKUP_PRIVADO');return s.isDirectory()?fs.readdirSync(file).reduce((n,v)=>n+size(path.join(file,v)),0):s.size;},estimated=present.reduce((n,file)=>n+size(path.join(root,file)),0),disk=fs.statfsSync(root);if(Number(disk.bavail)*Number(disk.bsize)<estimated*2+5*1024**3)throw Error('ESPACIO_INSUFICIENTE_PAQUETE_Y_VALIDACION');
 const result=spawnSync('tar',['-cf',target,'-C',root,...present],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error('ARCHIVO_PRIVADO_INCOMPLETO_REVISAR_TAR');
 const sha256=await streamDigest(target),control={created_at:new Date().toISOString(),archive:target,sha256,backup:relative,backup_sha256:manifest.backup.sha256,database_matches_backup:true,workers_paused:true,raw_provider_cache_included:true,sec_compressed_archives_included:true,sec_extracted_json_included:false,paths:present,warning:'PRIVATE: CONTAINS CREDENTIALS AND FINANCIAL DATA. NEVER PUBLISH.'};
 fs.writeFileSync(target+'.sha256',sha256+'\n');fs.writeFileSync(target+'.manifest.json',JSON.stringify(control,null,2));console.log(JSON.stringify({archive:target,sha256,backup:relative,paths:present.length,workers_paused:true}));
 }finally{await c.query('UNLOCK TABLES').catch(()=>{});for(const country of ['US','JP'])await c.query('SELECT RELEASE_LOCK(?)',['G2_PCV_RECOVERY_'+country]).catch(()=>{});c.release();}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
