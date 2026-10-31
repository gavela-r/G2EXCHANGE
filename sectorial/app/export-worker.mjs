import path from'node:path';import fs from'node:fs/promises';import{createRequire}from'node:module';import{pathToFileURL}from'node:url';
const require=createRequire(import.meta.url);require('./env.cjs');const store=require('./store.cjs');
// Exportador principal: el archivado con el run (Artifact Tool, presentación Inditex). Si @oai/artifact-tool no está
// instalado (dependencia privada del runtime de Codex), se usa el exportador portable SheetJS con las mismas fórmulas.
async function loadExporter(archive){
 try{const{exportWorkbook}=await import(pathToFileURL(path.join(archive,'exporter.mjs')).href);return{exporter:'ARTIFACT_TOOL_INDITEX',exportWorkbook};}
 catch(e){if(!/artifact-tool/.test(String(e.message)))throw e;const{exportWorkbookPortable}=await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')),'exporter-portable.mjs')).href);return{exporter:'PORTABLE_SHEETJS',exportWorkbook:exportWorkbookPortable};}
}
try{const id=store.valid(process.argv[2]),run=store.load(id),archive=store.archivedEngine(run.engineHash),{evaluate}=require(path.join(archive,'workflow.cjs')),{validateNative}=require('./native-qa.cjs');const x=evaluate(run.snapshot,run.configuration);if(x.result.resultHash!==run.result.resultHash)throw Error('REPLAY_NO_COINCIDE');
 const file=path.join(store.root,'exports',id+'.xlsx'),{exporter,exportWorkbook}=await loadExporter(archive);await exportWorkbook(run,x,file);
 if(process.platform!=='win32')throw Error('EXCEL_NATIVO_NO_DISPONIBLE: la validación exige Microsoft Excel en Windows; el archivo queda como no descargable');
 const native=await validateNative(run,x,file);console.log(JSON.stringify({id,exported:true,exporter,status:x.result.status,native:native.status}));}
catch(e){await fs.mkdir(path.join(store.root,'jobs'),{recursive:true});if(/^[a-f0-9]{64}$/.test(process.argv[2]??''))await fs.writeFile(path.join(store.root,'jobs',process.argv[2]+'.error.txt'),String(e.stack));console.error(e.message);process.exitCode=1;}
