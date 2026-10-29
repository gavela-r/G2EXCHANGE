// Separate SEC V2 receipt preserves the runtime policy of already checkpointed workers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(/recuperar-(sec-mapeo-v2|complementos-sec-v5)\.cjs$/i.test(process.argv[1]||'')){
 const root=path.resolve(__dirname,'../..'),index=process.argv.indexOf('--directory');if(index<0)throw Error('Directorio operativo explícito obligatorio');
 const dir=path.resolve(process.argv[index+1]);if(!dir.startsWith(path.join(root,'private_backups')+path.sep))throw Error('Directorio operativo fuera del almacenamiento privado');fs.mkdirSync(dir,{recursive:true});
 const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),files=[__filename,path.join(__dirname,'pcv-operacion-transaccional.cjs'),...['persistirRecuperacionVerificada','insertarAnualSecVerificado','insertarAnualEdinetVerificado'].map(n=>path.join(__dirname,'../dist/src/pcv',n+'.js'))];
 const receipt={policy:'PARENT_LOCKS_READ_COMMITTED_WHOLE_TRANSACTION_RETRY_V1',files:Object.fromEntries(files.map(f=>[path.basename(f),sha(f)])),max_attempts:3,isolation:'READ-COMMITTED'},file=path.join(dir,'operational-policy.json');
 if(fs.existsSync(file)&&JSON.stringify(JSON.parse(fs.readFileSync(file)))!==JSON.stringify(receipt))throw Error('POLITICA_OPERATIVA_CAMBIO_REQUIERE_REVISION');fs.writeFileSync(file,JSON.stringify(receipt));
 require('./pcv-operacion-transaccional.cjs').instalarOperacion(require('../dist/conexion/bd').default,{onRetry:e=>fs.appendFileSync(path.join(dir,'transaction-retries.jsonl'),JSON.stringify({...e,at:new Date().toISOString()})+'\n')});
}
