// Dated, local recovery workflow. Workers own financial transactions/checkpoints.
// The coordinator only gates phases, supervises processes and records their state.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {fuentesSecMaterializadas}=require('./pcv-sec-materializacion.cjs');
const root=path.resolve(__dirname,'../..');
const jobs=[
 {id:'us-bulk',directory:'pcv-us-bulk-20261029',args:['--job','sec-bulk']},
 {id:'us-verified',directory:'pcv-us-verificado-v1',after:'us-bulk',requireDone:true,args:['--job','sec-verified']},
 {id:'us-transient',directory:'pcv-us-transitorios',after:'us-verified',requireDone:true,args:['--job','transient-us']},
 {id:'us-mapping',directory:'pcv-us-mapeo-v2',after:'us-transient',requireDone:true,args:['--job','sec-mapping-v2']},
 {id:'us-complement',directory:'pcv-us-complementos-v5',after:'us-mapping',requireDone:true,args:['--job','complement-sec-v5','--country','US']},
 {id:'jp-cached',directory:'pcv-jp-cached-v4',args:['--job','edinet-verified','--phase','existing','--cached-only']},
 {id:'jp-identity-cached',directory:'pcv-jp-identidad-cached-v6',after:'jp-cached',requireDone:true,args:['--job','edinet-identity-v6','--phase','discover','--cached-only','--from','2022-01-01','--to','2026-06-30']},
 {id:'jp-discover',directory:'pcv-jp-descubrimiento-v4',after:'jp-identity-cached',requireDone:true,args:['--job','edinet-verified','--phase','discover','--from','2022-01-01','--to','2026-06-30']},
 {id:'jp-identity-discover',directory:'pcv-jp-identidad-descubrir-v6',after:'jp-discover',requireDone:true,args:['--job','edinet-identity-v6','--phase','discover','--from','2022-01-01','--to','2026-06-30']},
 {id:'jp-identity-existing',directory:'pcv-jp-identidad-existing-v6',after:'jp-identity-discover',requireDone:true,args:['--job','edinet-identity-v6','--phase','existing']},
 {id:'jp-existing',directory:'pcv-jp-online-v5',after:'jp-identity-existing',requireDone:true,args:['--job','edinet-online-v5','--phase','existing']},
 {id:'jp-complement',directory:'pcv-jp-complementos-identidad-v5',after:'jp-existing',requireDone:true,args:['--job','complement-identity-jp','--country','JP']}
];
const legacyJobs=[
 {id:'us-primary-v2',directory:'pcv-us-primary-full'},
 {id:'us-complement-v2',directory:'pcv-us-complementarios-v2'},
 {id:'us-bound-v1',directory:'pcv-us-vinculados'},
 {id:'jp-june-v2',directory:'pcv-jp-informes-jun2022-v2'},
 {id:'jp-discover-v2',directory:'pcv-jp-documentos-resto'},
 {id:'jp-import-v2',directory:'pcv-jp-informes-resto-v2'},
 {id:'jp-existing-v3',directory:'pcv-jp-full-v3'}
].map(j=>({...j,reason:'SUPERSEDED_BY_VERIFIED_FIELDS_V4; original checkpoints/queues preserved; never forced complete'}));
function eligibleJobs(states){return jobs.filter(j=>!states[j.id]?.done&&(!j.after||(j.requireDone?states[j.after]?.done:states[j.after]?.scan_complete||states[j.after]?.done))).map(j=>j.id);}
function sourceRecoveryComplete(states){return jobs.every(j=>states[j.id]?.done);}
function cumpleObjetivo85(periods){return ['US','JP'].every(country=>[2022,2023,2024,2025].every(year=>{const p=periods?.[country+'-'+year];return p&&p.fixed_pcv_pct>=85&&p.fixed_kpi_pct>=85&&p.source_verified_pcv_pct>=85&&p.source_verified_kpi_pct>=85;}));}
module.exports={eligibleJobs,sourceRecoveryComplete,cumpleObjetivo85,jobs,legacyJobs};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
async function main(){
 const {guardarEstadoPcv}=require('./pcv-checkpoint.cjs'),M=require('./pcv-mantenimiento.cjs'),hostname=require('node:os').hostname(),args=process.argv.slice(2),directory=path.join(root,'private_backups/pcv-orchestrator'),stateFile=path.join(directory,'plan-state.json'),stopFile=path.join(directory,'stop.request'),snapshotFile=path.join(directory,'snapshot.request'),lockFile=path.join(directory,'owner.json');
 const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 let bulkReady=false;
 const states=()=>Object.fromEntries(jobs.map(j=>{const s=read(path.join(root,'private_backups',j.directory,j.checkpoint||'checkpoint.json'));if(j.id==='us-bulk'&&s?.done){bulkReady=bulkReady||fuentesSecMaterializadas(path.join(root,'private_backups',j.directory),s);if(!bulkReady)return [j.id,{...s,done:false,scan_complete:false,source_archive_complete:true,source_materialization_missing:true}];}return [j.id,s];}));
 if(args.includes('--status')){const owner=read(lockFile);let alive=false;if(owner?.pid)try{process.kill(owner.pid,0);alive=true;}catch(e){if(e.code!=='ESRCH')throw e;}console.log(JSON.stringify({observed_at:new Date().toISOString(),owner_pid_alive:alive,persisted_plan_is_stale:!alive,plan:read(stateFile),eligible:eligibleJobs(states())}));return;}
 fs.mkdirSync(directory,{recursive:true});
 if(args.includes('--stop')){fs.writeFileSync(stopFile,new Date().toISOString());console.log('Parada del coordinador solicitada; termina tras las transacciones actuales.');return;}
 if(args.includes('--snapshot')){fs.writeFileSync(snapshotFile,new Date().toISOString());console.log('Backup alineado solicitado; el coordinador pausará y reanudará sus workers.');return;}
 if(!args.includes('--write'))throw Error('Coordinador requiere --write explícito; --status no escribe');
 if(fs.existsSync(lockFile)){
  const owner=read(lockFile);let alive=false;if(!owner.hostname||owner.hostname===hostname)try{process.kill(owner.pid,0);alive=true;}catch(e){if(e.code!=='ESRCH')throw e;}
  if(alive)throw Error('COORDINADOR_ACTIVO_O_PID_REUTILIZADO');if(!args.includes('--resume'))throw Error('Coordinador anterior terminado; usar --resume');
  fs.renameSync(lockFile,lockFile+'.previous-'+Date.now());
 }
 const fd=fs.openSync(lockFile,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,hostname,started_at:new Date().toISOString()}));
 const previous=read(stateFile),maintenance={last_metrics_at:null,snapshots:[],...previous?.maintenance},children=new Map(),failed=new Map();let stopping=false,maintenancePaused=!!maintenance.integrity_failed,maintenanceTask=null;
 const pauseJobs=()=>{for(const j of [...jobs,...legacyJobs]){const dir=path.join(root,'private_backups',j.directory);fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(path.join(dir,'stop.request')))fs.writeFileSync(path.join(dir,'stop.request'),new Date().toISOString());}};
 const resumeJobs=()=>{for(const file of [stopFile,...jobs.map(j=>path.join(root,'private_backups',j.directory,'stop.request'))])if(fs.existsSync(file))fs.renameSync(file,file+'.previous-'+Date.now());};
 const requestStop=()=>{stopping=true;pauseJobs();};
 const metrics=async()=>{maintenance.last_metrics_at=await M.actualizarMetricas();};
 const snapshot=async kind=>{maintenancePaused=true;maintenance.active='BACKUP_'+kind;pauseJobs();while(children.size)await new Promise(r=>setTimeout(r,1000));
  let verified=false;try{await M.verificarIntegridad();verified=true;maintenance.integrity_failed=false;await metrics();const proof=await M.crearSnapshot();maintenance.snapshots.push({kind,...proof});if(kind==='PRIMARY')maintenance.primary_backup=proof;if(kind==='COMPLETE')maintenance.completion_backup=proof;maintenance.last_error=null;failed.delete('maintenance');guardarEstadoPcv(stateFile,{...read(stateFile),updated_at:new Date().toISOString(),maintenance,recovery_finished:kind==='COMPLETE'});await metrics();}
  catch(e){maintenance.last_error=e.message;if(!verified)maintenance.integrity_failed=true;failed.set('maintenance',{code:e.message,at:new Date().toISOString()});}
  finally{maintenance.active=null;if(verified&&!stopping){maintenancePaused=false;resumeJobs();}}
 };
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,requestStop);
 try{
  if(args.includes('--resume-jobs'))resumeJobs();
  while(true){
   if(fs.existsSync(stopFile))requestStop();const current=states(),eligible=new Set(eligibleJobs(current));
   if(!stopping&&!maintenancePaused&&!sourceRecoveryComplete(current))for(const j of jobs){
    if(!eligible.has(j.id)||children.has(j.id)||failed.has(j.id)||fs.existsSync(path.join(root,'private_backups',j.directory,'stop.request')))continue;
    const out=fs.openSync(path.join(directory,j.id+'.out.log'),'a'),err=fs.openSync(path.join(directory,j.id+'.err.log'),'a');
    const child=spawn(process.execPath,[path.join(__dirname,'recuperar-pcv-watch.cjs'),...j.args,'--directory',path.join('private_backups',j.directory),'--write'],{cwd:root,stdio:['ignore',out,err],windowsHide:true});
    children.set(j.id,{child,out,err});
    const finish=code=>{const active=children.get(j.id);if(!active||active.child!==child)return;children.delete(j.id);fs.closeSync(out);fs.closeSync(err);if(code!==0&&!stopping)failed.set(j.id,{code:code??'SIGNAL_EXIT',at:new Date().toISOString()});};
    child.on('exit',finish);child.on('error',()=>finish(1));
   }
   const primaryDone=['us-bulk','us-verified','us-transient','us-mapping','jp-cached','jp-identity-cached','jp-discover','jp-identity-discover','jp-identity-existing','jp-existing'].every(id=>current[id]?.scan_complete||current[id]?.done);
   const allDone=sourceRecoveryComplete(current);
   if(!stopping&&!maintenanceTask){
    let kind=fs.existsSync(snapshotFile)?'REQUESTED':allDone&&!maintenance.completion_backup&&!failed.has('maintenance')?'COMPLETE':primaryDone&&!maintenance.primary_backup&&!failed.has('maintenance')?'PRIMARY':null;
    if(kind){if(fs.existsSync(snapshotFile))fs.renameSync(snapshotFile,snapshotFile+'.accepted-'+Date.now());maintenanceTask=snapshot(kind).finally(()=>{maintenanceTask=null;});}
    else if(!maintenancePaused&&Date.now()-Date.parse(maintenance.last_metrics_at||'1970-01-01')>=30*60000){maintenance.active='METRICS';maintenanceTask=metrics().catch(e=>{maintenance.last_error=e.message;}).finally(()=>{maintenance.active=null;maintenanceTask=null;});}
   }
   if(allDone&&maintenance.completion_backup&&!stopping)requestStop();
   guardarEstadoPcv(stateFile,{updated_at:new Date().toISOString(),pid:process.pid,status:stopping?(children.size||maintenanceTask?'STOPPING':'STOPPED'):maintenance.active?'MAINTENANCE':failed.size||maintenance.integrity_failed?'REVIEW_FAILURES':primaryDone?'PRIMARY_SCANS_FINISHED_QUOTA_OR_DATA_PENDING':'RUNNING',primary_scans_finished:primaryDone,source_recovery_finished:!!allDone,recovery_finished:!!allDone&&!!maintenance.completion_backup,maintenance,coverage_85_certified:cumpleObjetivo85(read(path.join(root,'private_backups/cobertura-estructural-after.json'))?.periods),retired_jobs:legacyJobs.map(j=>({...j,checkpoint_preserved:fs.existsSync(path.join(root,'private_backups',j.directory,'checkpoint.json'))})),active:Object.fromEntries([...children].map(([id,p])=>[id,p.child.pid])),failed:Object.fromEntries(failed),jobs:Object.fromEntries(jobs.map(j=>[j.id,{directory:j.directory,scan_complete:!!current[j.id]?.scan_complete,done:!!current[j.id]?.done,cursor:current[j.id]?.after??null,deferred:current[j.id]?.retryCompanies?.length||current[j.id]?.retryReports?.length||current[j.id]?.retrySources?.length||0,blocked_by:j.after&&!eligible.has(j.id)&&!current[j.id]?.done?j.after:null,stop_requested:fs.existsSync(path.join(root,'private_backups',j.directory,'stop.request'))}]))});
   if(stopping&&!children.size&&!maintenanceTask)break;
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
 }finally{requestStop();fs.closeSync(fd);fs.unlinkSync(lockFile);}
}
