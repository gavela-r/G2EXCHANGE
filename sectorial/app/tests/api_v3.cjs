// Regresión API contra el servicio aislado 127.0.0.1:3200 (MySQL sólo lectura). Escribe evidencias/api_v3.json.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='http://127.0.0.1:3200/api/sectorial',asOf='2026-10-30',results=[];
const raw=(p,headers={})=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3200,path:p,headers},res=>{let b='';res.on('data',x=>b+=x);res.on('end',()=>resolve({status:res.statusCode,body:b}));});r.on('error',reject);r.end();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const session=await(await fetch(base+'/session')).json();assert.equal(session.databaseWrites,false);assert.equal(session.buildStale,false);
 const request=async(url,body,token=session.token)=>{const r=await fetch(base+url,{headers:{'Content-Type':'application/json',...(token?{'X-Sectorial-Token':token}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const type=r.headers.get('content-type')??'';return{status:r.status,type,data:type.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};};
 const pass=(name,extra={})=>results.push({case:name,status:'PASS',...extra});
 const catalog=await request('/models');assert.equal(catalog.data.length,16);assert.ok(catalog.data.filter(m=>![13,14].includes(m.id)).every(m=>m.openingExtras.length===4));assert.deepEqual(catalog.data.map(m=>m.family).filter(f=>f!=='FCFF'),['BANK','INSURANCE','REIT']);pass('16_MODELOS_Y_FAMILIAS');
 assert.equal((await raw('/api/sectorial/models',{Host:'evil.example'})).status,403);pass('HOST_AJENO_RECHAZADO');
 assert.equal((await raw('/api/sectorial/models',{Host:'127.0.0.1:3200',Origin:'http://evil.example'})).status,403);pass('ORIGEN_AJENO_RECHAZADO');
 assert.equal((await raw('/../../.env',{Host:'127.0.0.1:3200'})).status,404);pass('TRAVERSAL_RECHAZADO');
 const ui=await raw('/',{Host:'127.0.0.1:3200'});assert.equal(ui.status,200);const js=ui.body.match(/assets\/index-[\w-]+\.js/)[0],bundle=(await raw('/'+js,{Host:'127.0.0.1:3200'})).body;for(const marker of['Perímetro contable completo','Alta en ejercicio proyectado','Excel de diagnóstico'])assert.ok(bundle.includes(marker),marker);pass('UI_COMPILADA_SERVIDA',{bundle:js});
 const companies={};
 for(const[q,id,model]of[['Toyota',11658,5],['Advanced Micro',13,3],['Microsoft',4,null]]){
  const s=await request('/companies?q='+encodeURIComponent(q));assert.ok(s.data.some(x=>x.id===id),q);
  const info=await request('/companies/'+id+'?asOf='+asOf);assert.equal(info.status,200);const snap=info.data.snapshot,res=info.data.result;
  assert.equal(res.status,'BLOQUEADO');assert.equal(res.source,'EMPRESA_MYSQL');assert.ok(res.scenarios.every(x=>x.valuePerShare===null));if(model)assert.equal(res.model?.id,model);
  for(const p of snap.periods)for(const[k,f]of Object.entries(p.fields))if(f.validation!=='VALIDADO')assert.equal(f.value,null,'NULL/conflicto convertido en número: '+k);
  assert.ok(snap.periods.every(p=>p.publication<=asOf),'Información posterior a la valoración');
  const tally={};for(const p of snap.periods)for(const f of Object.values(p.fields))tally[f.validation]=(tally[f.validation]??0)+1;
  companies[id]={name:snap.company.nombre_empresa,model:res.model?.id??null,periods:snap.periods.map(p=>p.periodEnd),currency:[...new Set(snap.periods.map(p=>p.currency))],validation:tally,issues:[...new Set(res.issues.map(x=>x.code))],requiredInputs:res.requiredInputs.length,inputHash:snap.inputHash};
  pass('EMPRESA_REAL_BLOQUEADA_'+id,{model:companies[id].model});
 }
 const early=await request('/companies/11658?asOf=2024-09-30');assert.equal(early.status,200);assert.ok(early.data.snapshot.periods.every(p=>p.publication<='2024-09-30'&&p.periodEnd<='2024-09-30'));assert.notDeepEqual(early.data.snapshot.periods.map(p=>p.periodEnd),companies[11658].periods);pass('LOOK_AHEAD_FECHA_ANTERIOR',{periods:early.data.snapshot.periods.map(p=>p.periodEnd)});
 const na=await request('/companies/1949?asOf='+asOf);assert.equal(na.data.result.model,null);assert.ok(na.data.result.issues.some(i=>i.code==='CLASIFICACION_NO_RESUELTA'));
 const declared={model:12,source:'Informe anual 10-K, descripción del negocio (pendiente de verificar)',reviewer:'QA API',reason:'Sector N/A en MySQL',referenceDate:asOf};
 const naRun=await request('/companies/1949/evaluate',{asOf,configuration:{companyId:1949,inputHash:na.data.snapshot.inputHash,scenarios:[{},{},{}],constants:{},classification:declared}});assert.equal(naRun.status,201);assert.equal(naRun.data.result.model.id,12);assert.equal(naRun.data.result.classification.declared.reviewer,'QA API');assert.ok(naRun.data.result.notices.some(n=>n.code==='CLASIFICACION_DECLARADA_POR_ANALISTA'));assert.equal(naRun.data.result.status,'BLOQUEADO');pass('CLASIFICACION_DECLARADA_EMPRESA_REAL_SIGUE_BLOQUEADA',{run:naRun.data.id});
 assert.equal((await request('/companies/11658/evaluate',{asOf,configuration:{companyId:11658,inputHash:companies[11658].inputHash,scenarios:[{},{},{}],constants:{},classification:declared}})).status,400);pass('CLASIFICACION_RESUELTA_NO_SUSTITUIBLE');
 assert.ok(companies[13].validation.CONFLICTIVO>0);pass('AMD_CONFLICTOS_VISIBLES_Y_NO_USADOS',{conflicts:companies[13].validation.CONFLICTIVO});
 const configuration={companyId:11658,inputHash:companies[11658].inputHash,scenarios:[{},{},{}],constants:{}};
 assert.equal((await request('/companies/11658/evaluate',{asOf,configuration},'')).status,403);pass('ESCRITURA_LOCAL_REQUIERE_SESION');
 assert.equal((await request('/companies/11658/evaluate',{asOf,configuration,historicos:[{}]})).status,400);pass('HISTORIA_CLIENTE_RECHAZADA');
 assert.equal((await request('/companies/11658/evaluate',{asOf,configuration:{...configuration,resultado:1}})).status,400);pass('CAMPO_CONFIG_NO_ADMITIDO');
 assert.equal((await request('/companies/11658/evaluate',{asOf,configuration:{...configuration,inputHash:'0'.repeat(64)}})).status,409);pass('HASH_OBSOLETO_RECHAZADO');
 assert.equal((await request('/companies/11658/evaluate',{asOf,configuration:{...configuration,constants:{shares:{value:1}}}})).status,400);pass('HIPOTESIS_SIN_FUENTE_RECHAZADA');
 assert.equal((await request('/companies/11658/evaluate',{asOf,configuration:{...configuration,constants:{shares:{value:1,source:'x',referenceDate:'2027-01-01'}}}})).status,400);pass('HIPOTESIS_FUTURA_RECHAZADA');
 const saved=await request('/companies/11658/evaluate',{asOf,configuration});assert.equal(saved.status,201);assert.equal(saved.data.result.status,'BLOQUEADO');assert.ok(saved.data.result.scenarios.every(x=>x.valuePerShare===null));pass('RUN_BLOQUEADO_PERSISTIDO',{run:saved.data.id});
 const again=await request('/companies/11658/evaluate',{asOf,configuration});assert.equal(again.data.id,saved.data.id);pass('IDEMPOTENCIA_LOCAL');
 const id=saved.data.id;assert.equal((await request('/runs/'+id+'/xlsx')).status,409);pass('DESCARGA_SIN_VALIDACION_RECHAZADA');
 let job=await request('/runs/'+id+'/export',{});assert.ok([200,202].includes(job.status));const t0=Date.now();
 while(!['COMPLETADO','ERROR'].includes(job.data.status)&&Date.now()-t0<420000){await sleep(3000);job=await request('/runs/'+id+'/job');}
 assert.equal(job.data.status,'COMPLETADO',JSON.stringify(job.data));
 const file=await request('/runs/'+id+'/xlsx');assert.equal(file.status,200);assert.equal(file.data.subarray(0,2).toString(),'PK');
 const v=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/exports',id+'.xlsx.validation.json'),'utf8'));assert.equal(v.sha256,crypto.createHash('sha256').update(file.data).digest('hex'));assert.equal(v.repairMode,false);
 pass('EXPORTACION_API_VALIDADA_EXCEL_Y_DESCARGADA',{seconds:(Date.now()-t0)/1000,formulaChecks:v.formulaChecks,sha256:v.sha256});
 const dossier=await request('/runs/'+id+'/json');for(const k of['snapshot','configuration','result','engineHash','createdAt'])assert.ok(dossier.data[k]!==undefined,k);assert.equal(dossier.data.result.financialApproval,'PENDIENTE');pass('EXPEDIENTE_TRAZABLE');
 const history=await request('/companies/11658/history');assert.ok(history.data.some(x=>x.id===id));pass('HISTORIAL_LOCAL');
 const out={at:new Date().toISOString(),service:'http://127.0.0.1:3200',engineHash:session.engineHash,companies,results,failures:0};fs.writeFileSync(path.join(__dirname,'../evidencias/api_v3.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({results:results.length,failures:0,companies}));
})().catch(e=>{fs.writeFileSync(path.join(__dirname,'../evidencias/api_v3.error.txt'),String(e.stack));console.error(e.message);process.exitCode=1;});
