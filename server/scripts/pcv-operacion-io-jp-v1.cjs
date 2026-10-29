// Additional operational receipt; original financial checkpoint signatures and
// READ COMMITTED / KPI prerequisite receipts remain unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const script=path.basename(process.argv[1]||'');
if(/^recuperar-(edinet-verificado|edinet-online-v5|edinet-identidad-v6|complementos-jp-identidad-v5)\.cjs$/.test(script)){
 const i=process.argv.indexOf('--directory'),root=path.resolve(__dirname,'../..');if(i<0)throw Error('JP_SHARED_IO_DIRECTORY_REQUIRED');const dir=path.resolve(process.argv[i+1]);if(!dir.startsWith(path.join(root,'private_backups')+path.sep))throw Error('JP_SHARED_IO_PRIVATE_DIRECTORY_REQUIRED');
 const files=[__filename,...['pcv-http-compartido-jp.cjs','pcv-retry-after.cjs','pcv-http.cjs','pcv-checkpoint.cjs'].map(f=>path.join(__dirname,f))],sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),receipt={policy:'GLOBAL_PROVIDER_RESERVATIONS_SINGLE_URL_LEASE_PRIORITY_FINANCIAL_WRITER_V1',files:Object.fromEntries(files.map(f=>[path.basename(f),sha(f)])),official_edinet_minimum_interval_ms:3500,max_download_workers:3,financial_writers_per_country:1},file=path.join(dir,'shared-http-policy-v1.json');
 if(fs.existsSync(file)&&JSON.stringify(JSON.parse(fs.readFileSync(file)))!==JSON.stringify(receipt))throw Error('JP_SHARED_IO_POLICY_CHANGED');fs.writeFileSync(file,JSON.stringify(receipt,null,2));require('./pcv-http-compartido-jp.cjs').instalarTransporteCompartido();
}
