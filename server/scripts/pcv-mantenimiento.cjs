// Private verification/backup tasks used by the recovery coordinator.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const {sha256File:streamHash}=require('./pcv-file-hash.cjs');
function run(executable,args,{capture=false,env={},label='maintenance'}={}){
 const logs=path.join(root,'private_backups/pcv-orchestrator');fs.mkdirSync(logs,{recursive:true});
 return new Promise((resolve,reject)=>{const out=fs.openSync(path.join(logs,label+'.out.log'),'a'),err=fs.openSync(path.join(logs,label+'.err.log'),'a');let text='',finished=false;
  const child=spawn(executable,args,{cwd:root,env:{...process.env,...env},stdio:['ignore',capture?'pipe':out,err],windowsHide:true});
  if(capture)child.stdout.on('data',chunk=>{fs.writeSync(out,chunk);text+=chunk.toString('utf8');if(text.length>4*1024*1024)child.kill();});
  const end=code=>{if(finished)return;finished=true;fs.closeSync(out);fs.closeSync(err);if(code!==0)reject(Error('TASK_FAILED_'+label));else resolve(text);};child.on('exit',end);child.on('error',()=>end(1));
 });
}
const script=(name,args=[],options={})=>run(process.execPath,[path.join(__dirname,name),...args],{label:name.replace(/\W/g,'_'),...options});
const object=text=>JSON.parse(text.trim().split(/\r?\n/).filter(line=>line.startsWith('{')).at(-1)||'{}');
async function actualizarMetricas(){await script('auditar-pcv-kpi-2022-2025.cjs',['--after']);await script('informe-pcv-proveedores.cjs');await script('auditar-cobertura-estructural.cjs',['--after']);await script('informe-cobertura-85.cjs');return new Date().toISOString();}
async function verificarIntegridad(){await script('verificar-pcv-integridad.cjs',['g2_recovery_20261028_validation']);}
async function crearSnapshot(){
 const stat=fs.statfsSync(root);if(Number(stat.bavail)*Number(stat.bsize)<3*1024**3)throw Error('ESPACIO_INSUFICIENTE_PARA_VERIFICAR_BACKUP');
 const stamp=new Date().toISOString().replace(/\D/g,''),backup=object(await script('backup-pcv-consistente.cjs',[],{capture:true})),database='g2_recovery_auto_'+stamp;
 if(!backup.backup||!backup.sha256)throw Error('BACKUP_SIN_MANIFIESTO');
 await script('restaurar-db.cjs',[backup.backup,database]);await script('verificar-backup-pcv.cjs',[backup.backup,database]);
 const bundle=object(await script('backup-controles-pcv.cjs',[backup.backup],{capture:true}));if(!bundle.archive||!bundle.sha256||await streamHash(bundle.archive)!==bundle.sha256)throw Error('PAQUETE_PRIVADO_INVALIDO');
 const validation=path.join(root,'private_backups','bundle-validation-'+stamp),source=path.join(root,'private_backups','bundle-source-'+stamp+'.tar');fs.mkdirSync(validation);
 await run('git',['archive','--format=tar','--output',source,'HEAD'],{label:'source_archive'});
 await run('tar',['-xf',source,'-C',validation],{label:'extract_source'});await run('tar',['-xf',bundle.archive,'-C',validation],{label:'extract_private'});
 const manifest=JSON.parse(fs.readFileSync(bundle.archive+'.manifest.json'));
 if(await streamHash(path.join(validation,manifest.backup))!==backup.sha256||hash(path.join(validation,'.env'))!==hash(path.join(root,'.env')))throw Error('EXTRACCION_PRIVADA_NO_COINCIDE');
 const replay=object(await run(process.execPath,[path.join(validation,'server/dist/src/valoracion/replay.js'),'533'],{capture:true,label:'extracted_replay',env:{DB_NAME:database,NODE_PATH:path.join(root,'server/node_modules')}}));
 if(replay.reproduced!==true||replay.run_id!==533)throw Error('REPLAY_EXTRAIDO_NO_REPRODUCIDO');
 const proof={created_at:new Date().toISOString(),database,backup:backup.backup,backup_sha256:backup.sha256,archive:bundle.archive,archive_sha256:bundle.sha256,all_tables_restored_and_verified:true,extracted_sql_verified:true,extracted_env_verified:true,extracted_replay_reproduced:true,run_id:533};
 fs.writeFileSync(bundle.archive+'.validation.json',JSON.stringify(proof,null,2));return proof;
}
module.exports={actualizarMetricas,verificarIntegridad,crearSnapshot};
