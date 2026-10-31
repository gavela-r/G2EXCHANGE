const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const store=require('./store.cjs');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function specification(run,x,file){
 const cases=x.plan?[1,2,3].map(scenario=>{const values=x.plan.grafo.evaluar({'control.case':scenario});return{scenario,nodes:x.plan.grafo.nodos.filter(n=>n.expr!==undefined).map(n=>({id:n.id,sheet:n.hoja,row:n.fila,col:n.columna,value:values.get(n.id)})),price:values.get(x.plan.salida.price[0].ref)};}):[];
 const mutation={capitalInputs:{}};
 for(const key of ['rf','beta','erp','kd','weightEquity','tax']){const n=x.plan?.grafo.indice.get('case.2.'+key+'.0');if(n)mutation.capitalInputs[key]={sheet:n.hoja,row:n.fila,col:n.columna,original:n.valor??null};}
 return{id:run.id,file,pathHash:digest(file),company:run.snapshot.company.id,status:run.result.status,cases,mutation};
}
async function validateNative(run,x,file){
 const spec=specification(run,x,file),specFile=file+'.native-input.json';fs.writeFileSync(specFile,JSON.stringify(spec));
 const command=fs.readFileSync(path.join(__dirname,'native-qa.ps1'),'utf8');
 const log=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:180000,maxBuffer:100000,env:{...process.env,G2_QA_SPEC:specFile}},(error,stdout,stderr)=>error?reject(Error('EXCEL_NATIVO_RECHAZADO: '+String(stderr||stdout||error.message).slice(-2500))):resolve(stdout)));
 const evidence=JSON.parse(String(log).trim());if(evidence.status!=='VALIDADO'||digest(file)!==spec.pathHash)throw Error('EXCEL_NATIVO_HASH_O_ESTADO_INVALIDO');
 fs.writeFileSync(file+'.validation.json',JSON.stringify({...evidence,sha256:spec.pathHash,runId:run.id,engineHash:run.engineHash,at:new Date().toISOString()},null,2));return evidence;
}
module.exports={validateNative,specification,digest};
