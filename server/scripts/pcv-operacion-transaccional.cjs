// Operational adapter only: no change to facts, mappings, formulas or missing-
// only writes. Parent report/company locks, unique keys and atomic transactions
// remain in the original persistence functions. READ COMMITTED avoids unrelated
// new reports deadlocking on empty KPI index gaps. Retry the WHOLE transaction.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const transient=e=>e?.code==='ER_LOCK_DEADLOCK'||e?.errno===1213||e?.code==='ER_LOCK_WAIT_TIMEOUT'||e?.errno===1205;
async function retryTransaction(fn,{onRetry=()=>{},attempts=3,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){for(let n=1;;n++){try{return await fn();}catch(e){if(!transient(e)||n>=attempts)throw e;onRetry({attempt:n,code:e.code||String(e.errno)});await delay(50*n+Math.floor(Math.random()*50));}}}
function instalarOperacion(pool,{onRetry=()=>{}}={}){
 const acquire=pool.getConnection.bind(pool);pool.getConnection=async()=>{const c=await acquire();try{await c.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');return c;}catch(e){c.release();throw e;}};
 if(typeof pool.query==='function'){const query=pool.query.bind(pool);pool.query=(...args)=>retryTransaction(()=>query(...args),{onRetry:event=>onRetry({operation:'AUTOCOMMIT_QUERY',...event})});}
 const targets=[['persistirRecuperacionVerificada','../dist/src/pcv/persistirRecuperacionVerificada'],['insertarAnualSecVerificado','../dist/src/pcv/insertarAnualSecVerificado'],['insertarAnualEdinetVerificado','../dist/src/pcv/insertarAnualEdinetVerificado']];
 for(const [name,file]of targets){const mod=require(file),original=mod[name];mod[name]=(...args)=>{
  // An insertion passes a borrowed connection to its nested persistence call.
  // That call MUST bubble errors to the owning outer transaction's rollback.
  if(args[0]!==pool)return original(...args);
  return retryTransaction(()=>original(...args),{onRetry:event=>onRetry({operation:name,report:args[1]?.id,company:args[1]?.empresa_id,year:args[1]?.end?.slice(0,4),...event})});
 };}
}
module.exports={retryTransaction,instalarOperacion,transient};
if(/recuperar-(sec-verificado|edinet-verificado|edinet-online-v5|complementos-verificados)\.cjs$/i.test(process.argv[1]||'')){
 const root=path.resolve(__dirname,'../..'),index=process.argv.indexOf('--directory');if(index<0)throw Error('Directorio operativo explícito obligatorio');const dir=path.resolve(process.argv[index+1]);if(!dir.startsWith(path.join(root,'private_backups')+path.sep))throw Error('Directorio operativo fuera del almacenamiento privado');fs.mkdirSync(dir,{recursive:true});
 const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),financial=['persistirRecuperacionVerificada','insertarAnualSecVerificado','insertarAnualEdinetVerificado'].map(name=>path.join(__dirname,'../dist/src/pcv',name+'.js'));
 const receipt={policy:'PARENT_LOCKS_READ_COMMITTED_WHOLE_TRANSACTION_RETRY_V1',runtime_sha256:sha(__filename),financial_files:Object.fromEntries(financial.map(f=>[path.basename(f),sha(f)])),max_attempts:3,isolation:'READ-COMMITTED'},receiptFile=path.join(dir,'operational-policy.json');
 if(fs.existsSync(receiptFile)&&JSON.stringify(JSON.parse(fs.readFileSync(receiptFile)))!==JSON.stringify(receipt))throw Error('POLITICA_OPERATIVA_CAMBIO_REQUIERE_REVISION');fs.writeFileSync(receiptFile,JSON.stringify(receipt));
 instalarOperacion(require('../dist/conexion/bd').default,{onRetry:event=>fs.appendFileSync(path.join(dir,'transaction-retries.jsonl'),JSON.stringify({...event,at:new Date().toISOString()})+'\n')});
}
