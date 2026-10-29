// Layer the reviewed prerequisite policy over the unchanged checkpointed
// financial files. Keep previous operational receipts and financial signatures.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const script=path.basename(process.argv[1]||'');
if(/^recuperar-(sec-verificado|sec-mapeo-v2|edinet-verificado|edinet-online-v5|edinet-identidad-v6|complementos-verificados|complementos-sec-v5|complementos-jp-identidad-v5)\.cjs$/.test(script)){
 if(/edinet-identidad-v6|complementos-jp-identidad-v5/.test(script))require('./pcv-operacion-identidad-jp.cjs');
 else if(/sec-mapeo-v2|complementos-sec-v5/.test(script))require('./pcv-operacion-sec-v2.cjs');else require('./pcv-operacion-transaccional.cjs');
 const root=path.resolve(__dirname,'../..'),i=process.argv.indexOf('--directory');if(i<0)throw Error('DIRECTORIO_POLITICA_KPI_OBLIGATORIO');const dir=path.resolve(process.argv[i+1]);if(!dir.startsWith(path.join(root,'private_backups')+path.sep))throw Error('DIRECTORIO_POLITICA_KPI_FUERA_DE_PRIVADO');
 const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),files=[__filename,path.join(__dirname,'pcv-prerrequisitos-kpi.cjs'),path.join(__dirname,'../dist/insercionDatos/insercionKPIInformeFinanciero.js')],receipt={policy:'BOTH_VERIFIED_DEBT_COMPONENTS_REQUIRED_V2',formula_unchanged:true,files:Object.fromEntries(files.map(f=>[path.basename(f),sha(f)]))},file=path.join(dir,'kpi-prerequisite-policy-v2.json');
 if(fs.existsSync(file)&&JSON.stringify(JSON.parse(fs.readFileSync(file)))!==JSON.stringify(receipt))throw Error('POLITICA_PRERREQUISITOS_KPI_CAMBIO');fs.writeFileSync(file,JSON.stringify(receipt,null,2));require('./pcv-prerrequisitos-kpi.cjs').instalarRequisitos();
}
