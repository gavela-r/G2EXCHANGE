const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {app,pool}=require('../dist-capital/server/src/capital/main');
const out=path.resolve(__dirname,'../../valuation_engine/research/coste_capital/fase3/evidencias'),exportsDir=path.resolve(out,'../salida');
fs.mkdirSync(exportsDir,{recursive:true});
(async()=>{const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port+'/api/capital',checks=[];
 let token;async function call(url,body,expected=200){const r=await fetch(base+url,{...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Capital-Review-Token':token},body:JSON.stringify(body)}:{})});const result=await r.json();checks.push({url,method:body?'POST':'GET',status:r.status,expected});if(r.status!==expected)throw Error(JSON.stringify({url,status:r.status,result}));return result;}
 try{
 token=(await call('/session')).token;
 const search=await call('/companies?q=NVIDIA');if(!search.some(c=>c.id===1))throw Error('Empresa real no encontrada');
 const d=await call('/companies/1?asOf=2026-10-29&periodEnd=2025-01-26');
 const saved=await call('/companies/1/evaluations',{asOf:'2026-10-29',periodEnd:'2025-01-26'},201);
 const history=await call('/companies/1/history');
 const previousDecisionId=history.find(x=>x.id===saved.analysisId&&x.decision_id!==null)?.decision_id??null;
 await call(`/analyses/${saved.analysisId}/decisions`,{action:'APPROVED',reason:'PRUEBA TECNICA AUTOMATIZADA: verificar bloqueo de diagnóstico',requestId:crypto.randomUUID(),previousDecisionId},409);
 await call(`/analyses/${saved.analysisId}/decisions`,{action:'REJECTED',reason:'PRUEBA TECNICA AUTOMATIZADA: no aplicar prima no estimable; no es aprobación financiera',requestId:crypto.randomUUID(),previousDecisionId},201);
 const sim=await call('/runs/533/simulations',{keBps:0,kdBps:0},201);
 const benchmark=await call('/companies/1/benchmarks',{asOf:'2026-10-29',periodEnd:'2022-01-30',periodPolicy:'ANNUAL_CLOSE_YEAR'},201);
 const stats=benchmark.benchmarks?.map(x=>({indicator:x.propuesta.indicador.id,n:x.benchmark.estadisticas?.n??0,exclusions:x.benchmark.exclusiones.length}))??[];
 for(const [kind,id]of [['diagnostico',saved.analysisId],['simulacion',sim.analysisId]])for(const format of ['xlsx','pdf','json']){
  const url=`/analyses/${id}/export/${format}`,r=await fetch(base+url);checks.push({url,method:'GET',status:r.status,expected:200});if(!r.ok)throw Error('Exportación fallida '+url+': '+await r.text());const buffer=Buffer.from(await r.arrayBuffer());fs.writeFileSync(path.join(exportsDir,kind+'.'+format),buffer);
  if(format==='pdf'&&buffer.subarray(0,5).toString()!=='%PDF-')throw Error('PDF no válido');
 }
 await call('/companies/1/history');
 const result={at:new Date().toISOString(),scope:'API local sobre copia de desarrollo; datos reales; hipótesis de tasas cero',checks,diagnostic:{company:d.empresa.nombre_empresa,period:d.periodoSeleccionado,validIndicators:d.cobertura.validados,indicators:d.indicadores.filter(i=>i.valor!==null).map(i=>({id:i.id,value:i.valor,unit:i.unidad,currency:i.moneda}))},analysisId:saved.analysisId,simulationId:sim.analysisId,benchmarkId:benchmark.analysisId,benchmarkUniverse:benchmark.universo?.length,benchmarkStatistics:stats,exports:fs.readdirSync(exportsDir),visualReview:'NOT_VERIFIED: browser host unavailable; native app approval timed out'};
 fs.writeFileSync(path.join(out,'api-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,diagnostic:{...result.diagnostic,indicators:undefined},benchmarkStatistics:stats.filter(x=>x.n>0)}));
 }finally{await new Promise(r=>server.close(r));await pool.end();}})().catch(e=>{console.error(e.code||e.stack);process.exitCode=1});
