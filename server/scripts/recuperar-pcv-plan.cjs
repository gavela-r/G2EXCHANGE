// Dated, local recovery workflow. Workers own financial transactions/checkpoints.
// The coordinator only gates phases, supervises processes and records their state.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const jobs=[
 {id:'us-primary',directory:'pcv-us-primary-full',args:['--country','US','--primary-only']},
 {id:'us-complement',directory:'pcv-us-complementarios-v2',after:'us-primary',requireDone:true,args:['--country','US']},
 {id:'us-bound',directory:'pcv-us-vinculados',after:'us-primary',requireDone:true,args:['--job','sec-bound']},
 {id:'jp-june',directory:'pcv-jp-informes-jun2022-v2',args:['--job','reports-jp-v2','--phase','import','--source-directory','private_backups/pcv-jp-documentos-jun2022']},
 {id:'jp-discover',directory:'pcv-jp-documentos-resto',after:'jp-june',checkpoint:'collect-checkpoint.json',args:['--job','reports-jp-v2','--phase','collect','--from','2022-01-01','--to','2026-06-30']},
 {id:'jp-import',directory:'pcv-jp-informes-resto-v2',after:'jp-discover',requireDone:true,args:['--job','reports-jp-v2','--phase','import','--source-directory','private_backups/pcv-jp-documentos-resto']},
 {id:'jp-existing',directory:'pcv-jp-full-v3',after:'jp-import',args:['--job','jp-v3','--country','JP']}
];
function eligibleJobs(states){return jobs.filter(j=>!states[j.id]?.done&&(!j.after||(j.requireDone?states[j.after]?.done:states[j.after]?.scan_complete||states[j.after]?.done))).map(j=>j.id);}
function sourceRecoveryComplete(states){return jobs.every(j=>states[j.id]?.done);}
module.exports={eligibleJobs,sourceRecoveryComplete,jobs};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
async function main(){
 const {guardarEstadoPcv}=require('./pcv-checkpoint.cjs'),M=require('./pcv-mantenimiento.cjs'),hostname=require('node:os').hostname(),args=process.argv.slice(2),directory=path.join(root,'private_backups/pcv-orchestrator'),stateFile=path.join(directory,'plan-state.json'),stopFile=path.join(directory,'stop.request'),snapshotFile=path.join(directory,'snapshot.request'),lockFile=path.join(directory,'owner.json');
 const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const states=()=>Object.fromEntries(jobs.map(j=>[j.id,read(path.join(root,'private_backups',j.directory,j.checkpoint||'checkpoint.json'))]));
 if(args.includes('--status')){console.log(JSON.stringify({plan:read(stateFile),eligible:eligibleJobs(states())}));return;}
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
 const pauseJobs=()=>{for(const j of jobs){const dir=path.join(root,'private_backups',j.directory);fs.mkdirSync(dir,{recursive:true});if(!fs.existsSync(path.join(dir,'stop.request')))fs.writeFileSync(path.join(dir,'stop.request'),new Date().toISOString());}};
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
   const primaryDone=['us-primary','jp-june','jp-discover','jp-import','jp-existing'].every(id=>current[id]?.scan_complete||current[id]?.done);
   const allDone=sourceRecoveryComplete(current);
   if(!stopping&&!maintenanceTask){
    let kind=fs.existsSync(snapshotFile)?'REQUESTED':allDone&&!maintenance.completion_backup&&!failed.has('maintenance')?'COMPLETE':primaryDone&&!maintenance.primary_backup&&!failed.has('maintenance')?'PRIMARY':null;
    if(kind){if(fs.existsSync(snapshotFile))fs.renameSync(snapshotFile,snapshotFile+'.accepted-'+Date.now());maintenanceTask=snapshot(kind).finally(()=>{maintenanceTask=null;});}
    else if(!maintenancePaused&&Date.now()-Date.parse(maintenance.last_metrics_at||'1970-01-01')>=30*60000){maintenance.active='METRICS';maintenanceTask=metrics().catch(e=>{maintenance.last_error=e.message;}).finally(()=>{maintenance.active=null;maintenanceTask=null;});}
   }
   if(allDone&&maintenance.completion_backup&&!stopping)requestStop();
   guardarEstadoPcv(stateFile,{updated_at:new Date().toISOString(),pid:process.pid,status:stopping?(children.size||maintenanceTask?'STOPPING':'STOPPED'):maintenance.active?'MAINTENANCE':failed.size||maintenance.integrity_failed?'REVIEW_FAILURES':primaryDone?'PRIMARY_SCANS_FINISHED_QUOTA_OR_DATA_PENDING':'RUNNING',primary_scans_finished:primaryDone,source_recovery_finished:!!allDone,recovery_finished:!!allDone&&!!maintenance.completion_backup,maintenance,active:Object.fromEntries([...children].map(([id,p])=>[id,p.child.pid])),failed:Object.fromEntries(failed),jobs:Object.fromEntries(jobs.map(j=>[j.id,{directory:j.directory,scan_complete:!!current[j.id]?.scan_complete,done:!!current[j.id]?.done,cursor:current[j.id]?.after??null,deferred:current[j.id]?.retryCompanies?.length||current[j.id]?.retryReports?.length||0,blocked_by:j.after&&!eligible.has(j.id)&&!current[j.id]?.done?j.after:null,stop_requested:fs.existsSync(path.join(root,'private_backups',j.directory,'stop.request'))}]))});
   if(stopping&&!children.size&&!maintenanceTask)break;
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
 }finally{requestStop();fs.closeSync(fd);fs.unlinkSync(lockFile);}
}
