// QA de la ruta exacta de la API (workflow.evaluate -> exportWorkbook -> validateNative) para los 16 sectores
// con expedientes completos sintéticos. No usa data/runs. Registra la versión exacta ensayada.
// Uso: node tests/qa_api_final.mjs [--sin-excel] [--eventos] [--out=carpeta] [sector ...]
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{createRequire}from'node:module';
import{root,buildCase,identities,sha}from'./qa_fixtures.mjs';
const require=createRequire(import.meta.url),store=require(path.join(root,'store.cjs')),{validateNative}=require(path.join(root,'native-qa.cjs')),{models}=require(path.join(root,'registry.cjs'));
const{exportWorkbook}=await import(new URL('../exporter.mjs',import.meta.url));
const args=process.argv.slice(2),native=!args.includes('--sin-excel'),events=args.includes('--eventos'),only=args.filter(x=>/^\d+$/.test(x)).map(Number);
const out=path.join(root,args.find(a=>a.startsWith('--out='))?.slice(6)??(events?'qa_api_final_eventos':'qa_api_final'));fs.mkdirSync(out,{recursive:true});
const fileHash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const engineHash=store.engineHash(),summary={at:new Date().toISOString(),engineHash,events,tipo:'QA_SINTETICO_RUTA_API_NO_APROBACION_FINANCIERA',native,sectors:[]};
for(const m of models){if(only.length&&!only.includes(m.id))continue;const row={sector:m.id,name:m.name,family:m.family,method:m.method,revenueDrivers:m.revenueDrivers};
 try{
  const{snapshot,config,x}=buildCase(m.id,{events});
  Object.assign(row,{status:x.result.status,inputHash:snapshot.inputHash,configurationHash:x.result.configurationHash,resultHash:x.result.resultHash,issues:x.result.issues.map(i=>i.code+(i.field?':'+i.field:'')),missingInputs:x.result.requiredInputs.length,prices:x.result.scenarios.map(s=>s.valuePerShare)});
  if(x.result.status==='CALCULADO_PENDIENTE_REVISION'){const id=identities(x);row.identityChecks=id.checks;row.identityFailures=id.failures;}
  if(native&&x.plan){const file=path.join(out,'QA_SECTOR_'+String(m.id).padStart(2,'0')+'.xlsx');for(const suffix of['','.draft.xlsx','.qa.json','.validation.json','.native-input.json'])fs.rmSync(file+suffix,{force:true});
   const run={id:sha({sector:m.id,input:snapshot.inputHash,config:x.result.configurationHash,engineHash}),engineHash,snapshot,configuration:config,result:x.result};
   const t0=Date.now(),{evidence}=await exportWorkbook(run,x,file);row.tsExcelArtifactChecks=evidence.comparisons;row.exportSeconds=(Date.now()-t0)/1000;
   const t1=Date.now(),v=await validateNative(run,x,file);row.native={status:v.status,openedNormally:v.openedNormally,repairMode:v.repairMode,formulaChecks:v.formulaChecks,brokenReferences:v.brokenReferences,capitalMutation:v.capitalMutation,excelVersion:v.excelVersion,seconds:(Date.now()-t1)/1000};row.file=path.relative(root,file);row.xlsxSha256=fileHash(file);}
 }catch(e){row.error=String(e.stack).slice(0,1500);}
 summary.sectors.push(row);if(native)fs.writeFileSync(path.join(out,'progreso.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({sector:row.sector,status:row.status,prices:row.prices,identityFailures:row.identityFailures?.length,native:row.native?.status,formulaChecks:row.native?.formulaChecks,error:row.error?.slice(0,300)}));
}
summary.engineHashAtEnd=store.engineHash();if(summary.engineHashAtEnd!==engineHash)summary.warning='EL_CODIGO_CAMBIO_DURANTE_LA_EJECUCION';
fs.writeFileSync(path.join(out,(native?'qa_api_16':'qa_api_16_ts')+(only.length?'_'+only.join('-'):'')+'.json'),JSON.stringify(summary,null,2));
