// Reproducción offline del nuevo motor desde su paquete archivado. Sólo SELECT en la copia.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{options,target,checkTarget}=require('./capital-dev.cjs');checkTarget();
const mysql=require('../node_modules/mysql2/promise'),M=require('./capital-manifest.cjs'),root=M.root;
const canonical=v=>JSON.stringify(normal(v));function normal(v){if(Array.isArray(v))return v.map(normal);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normal(v[k])]));return v;}
(async()=>{const c=await mysql.createConnection({...options(),database:target});try{await c.query('SET SESSION TRANSACTION READ ONLY');const [rows]=await c.query("SELECT * FROM capital_analysis WHERE kind='SIMULATION' ORDER BY id"),results=[];
 for(const row of rows){const p=typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload_json,m=p.executionManifest;
  if(!m?.compiledHash||row.payload_encoding_version!==2){results.push({analysis:row.id,status:'DEV_PRE_RELEASE_WITHOUT_EXACT_SNAPSHOT'});continue;}
  try{if(!/^[a-f0-9]{64}$/.test(m.archiveHash))throw Error('Archivo inválido');const archive=path.join(root,'valuation_engine/research/coste_capital/fase3/archives',m.archiveHash),source={},compiled={};
   for(const f of m.files){if(path.isAbsolute(f)||f.includes('..')||!/^((server|valuation_engine)\/)/.test(f))throw Error('Ruta de archivo no permitida');const value=fs.readFileSync(path.join(archive,f),'utf8');(f.startsWith('server/dist-capital/')?compiled:source)[f]=value;}
   if(M.hash(source)!==m.sourceHash||M.hash(compiled)!==m.compiledHash||M.hash({version:m.version,sourceHash:m.sourceHash,compiledHash:m.compiledHash})!==m.archiveHash)throw Error('Huella de código archivado diferente');
   let snapshot=p.fuenteCongelada;if(!snapshot){const [[r]]=await c.query('SELECT input_json,output_json FROM valuation_execution WHERE valuation_run_id=?',[row.parent_run_id]);snapshot={input:JSON.parse(r.input_json),output:JSON.parse(r.output_json)};}
   const engine=require(path.join(archive,'server/dist-capital/server/src/capital/finanzas.js')),hyp=p.escenarios[0].hipotesis;
   const actual=p.uso==='AUTOMATICO_PRIMAS'?require(path.join(archive,'server/dist-capital/server/src/capital/automatico.js')).simularPrimasAutomaticas(snapshot.input,snapshot.output,p.entradaPrimas.diagnostico,p.entradaPrimas.metodos,p.entradaPrimas.inputHash,p.entradaPrimas.aprobados):hyp?engine.simularRun(snapshot.input,snapshot.output,hyp.keBps,hyp.kdBps):engine.valorarConAprobados(snapshot.input,snapshot.output,p.escenarios[0].ajustesAprobados);
   const saved=Object.fromEntries(Object.keys(actual).map(k=>[k,p[k]]));const exact=canonical(saved)===canonical(actual);results.push({analysis:row.id,status:exact?'EXACT_MATCH':'FAIL',sourceHash:m.sourceHash,compiledHash:m.compiledHash,nodeRecorded:m.node,nodeCurrent:process.version,resultHash:crypto.createHash('sha256').update(canonical(actual)).digest('hex')});
  }catch(e){results.push({analysis:row.id,status:'FAIL',error:e.message});}
 }
 const report={at:new Date().toISOString(),database:target,readOnly:true,results};fs.writeFileSync(path.join(root,'valuation_engine/research/coste_capital/fase3/evidencias/replay-capital-v2.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
 }finally{await c.end();}})().catch(e=>{console.error(e.code||e.stack);process.exitCode=1;});
