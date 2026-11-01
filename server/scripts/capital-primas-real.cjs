// Ejemplos reales acotados. Sólo escrituras en la copia explícita de desarrollo.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {options,target,checkTarget}=require('./capital-dev.cjs');checkTarget();
const mysql=require('../node_modules/mysql2/promise'),{app,pool}=require('../dist-capital/server/src/capital/main');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'valuation_engine/research/coste_capital/fase4'),sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
fs.mkdirSync(path.join(out,'evidencias'),{recursive:true});fs.mkdirSync(path.join(out,'salida'),{recursive:true});
(async()=>{const source=await mysql.createConnection({...options(),database:process.env.DB_NAME}),server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port+'/api/capital',checks=[];
 try{await source.query('SET SESSION TRANSACTION READ ONLY');await source.query('SET SESSION MAX_EXECUTION_TIME=2500');
 const [copied]=await pool.query('SELECT valuation_run_id FROM valuation_execution ORDER BY valuation_run_id'),ids=copied.map(r=>r.valuation_run_id);
 const readFrozen=async()=>{const [rows]=await source.query('SELECT * FROM valuation_execution WHERE valuation_run_id IN (?) ORDER BY valuation_run_id',[ids]);return {n:rows.length,hash:sha(rows)};};const before=await readFrozen();
 let token;async function call(url,body){const r=await fetch(base+url,{...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Capital-Review-Token':token},body:JSON.stringify(body)}:{})});const result=await r.json();checks.push({url,status:r.status});if(!r.ok)throw Error(JSON.stringify({url,status:r.status,error:result.error}));return result;}
 token=(await call('/session')).token;
 const samples=[{id:13,market:'US',run:533,file:'AMD_US'},{id:11658,market:'JP',file:'TOYOTA_JP'},{id:19630,market:'TW',file:'GOGOLOOK_TW'}],results=[];
 for(const s of samples){let payload,id;
  if(s.run){const result=await call(`/runs/${s.run}/automatic-premiums`,{});payload=result;id=result.analysisId;}
  else{const saved=await call(`/companies/${s.id}/evaluations`,{asOf:'2026-10-30'});payload=saved.payload;id=saved.analysisId;}
  for(const format of ['xlsx','pdf','json']){const r=await fetch(base+`/analyses/${id}/export/${format}`);assert.equal(r.status,200);fs.writeFileSync(path.join(out,'salida',s.file+'.'+format),Buffer.from(await r.arrayBuffer()));}
  const baseScenario=payload.escenarios?.find(x=>x.escenario==='BASE'),primes=payload.primasAutomaticas.primas;
  results.push({empresaId:s.id,empresa:payload.empresaNombre??payload.empresa.nombre_empresa,mercado:s.market,fecha:payload.fechaValoracion??payload.fecha,analysisId:id,primas:primes,keBase:baseScenario?.keBase??null,keAjustado:baseScenario?.keAjustado??null,waccBase:baseScenario?.waccBase??null,waccAjustado:baseScenario?.waccAjustado??null,valorIntrinsecoOriginal:baseScenario?.impacto.original?.fair_value??null,valorIntrinsecoAjustado:baseScenario?.impacto.ajustado?.fair_value??null,impacto:baseScenario?.impacto.diferenciaAbsoluta??null,moneda:payload.fuenteCongelada?.input.currency??null,nota:s.run?'Flujos congelados; sólo cambia tasa.':'No hay ejecución congelada de este mercado en la copia; no se inventan Ke/WACC ni valor intrínseco.',archivo:s.file+'.xlsx'});
 }
 const [[methods]]=await pool.query("SELECT COUNT(*) total,COUNT(CASE WHEN status='APPROVED' THEN 1 END) approved FROM capital_methodology");
 const after=await readFrozen();assert.deepEqual(after,before);
 const [devFrozen]=await pool.query('SELECT * FROM valuation_execution ORDER BY valuation_run_id');assert.equal(sha(devFrozen),before.hash);
 const report={at:new Date().toISOString(),database:target,scope:'Tres empresas reales seleccionadas; no es un recuento de las 13.194 empresas',checks,methods,results,counts:{empresas:results.length,conAlgunaPrimaEstimada:results.filter(r=>r.primas.some(p=>p.primaCalculada!==null)).length,conDosPrimasEstimadas:results.filter(r=>r.primas.every(p=>p.primaCalculada!==null)).length,conDosCerosProvisionales:results.filter(r=>r.primas.every(p=>p.estadoFinanciero==='NO_ESTIMABLE'&&p.ajusteOperativo===0)).length},frozen:{before,after,copyIdentical:true}};
 fs.writeFileSync(path.join(out,'evidencias/ejemplos-reales.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:results.map(r=>({...r,primas:r.primas.map(p=>({factor:p.factor,primaCalculada:p.primaCalculada,ajusteOperativo:p.ajusteOperativo,estado:p.estadoFinanciero}))}))}));
 }finally{await new Promise(r=>server.close(r));await pool.end();await source.end();}
})().catch(e=>{console.error(e.code||e.stack);process.exitCode=1});
