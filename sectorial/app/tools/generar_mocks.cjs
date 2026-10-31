// Genera sectorial/app/mocks/*.json ejecutando la API real en modo MOCK (sin MySQL). Los ejemplos son respuestas reales
// del servidor sobre datos sintéticos rotulados; la cobertura mock se CALCULA sobre esos expedientes (no se escribe a mano).
const fs=require('node:fs'),path=require('node:path');
const{createApp}=require('../server.cjs'),{createMockSource}=require('../mock.cjs'),{KPIS}=require('../kpi.cjs'),{MAP}=require('../adapter.cjs'),{CORE}=require('./cobertura_mysql.cjs');
const out=path.join(__dirname,'../mocks'),codeOf=Object.fromEntries(Object.entries(MAP).map(([c,f])=>[f,c])),fieldOf=MAP,pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
function mockCoverage(snapshots){const matrix=[];for(const year of[2022,2023,2024,2025]){const ps=snapshots.map(s=>s.periods.find(p=>p.fiscalYear===year)).filter(Boolean);let present=0,cert=0,conflict=0,kcert=0;
 for(const p of ps){for(const c of CORE){const f=p.fields[fieldOf[c]];if(f?.value!=null||f?.validation==='CONFLICTIVO'){present++;if(f.validation==='VALIDADO')cert++;else if(f.validation==='CONFLICTIVO')conflict++;}}for(const k of KPIS)if(k.inputs.every(x=>p.fields[x]?.validation==='VALIDADO'&&typeof p.fields[x].value==='number'))kcert++;}
 const expected=snapshots.length*CORE.length;matrix.push({country:'US',year,companies:snapshots.length,companiesWithReport:ps.length,pcv:{expected,present,certified:cert,conflict,absent:expected-present,notApplicable:0,grossCoverage:pct(present,expected),certifiedCoverage:pct(cert,expected)},kpi:{expected:snapshots.length*KPIS.length,certified:kcert,certifiedCoverage:pct(kcert,snapshots.length*KPIS.length)}});}
 return{generatedAt:new Date().toISOString(),source:'MOCK_SINTETICO',warning:'Cobertura calculada sobre los expedientes MOCK sintéticos. No representa la base de datos real.',definition:{core:CORE},matrix};}
(async()=>{
 const source=await createMockSource();fs.mkdirSync(out,{recursive:true});
 const snaps=await Promise.all((await source.search('')).map(c=>source.load(c.id)));fs.writeFileSync(path.join(out,'coverage.json'),JSON.stringify(mockCoverage(snaps),null,2));
 const app=createApp(null,{source});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port+'/api/sectorial';
 const get=async p=>{const r=await fetch(base+p);return{status:r.status,body:await r.json()};},token=(await get('/session')).body.token;
 const post=async(p,b,t=token)=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...(t?{'X-Sectorial-Token':t}:{})},body:JSON.stringify(b)});return{status:r.status,body:await r.json()};};
 const save=(name,request,response)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({request,response},null,2));
 const session=await get('/session');session.body.token='<token de sesión local; cambia en cada arranque>';save('session',{method:'GET',path:'/api/sectorial/session'},session);
 save('health',{method:'GET',path:'/api/sectorial/health'},await get('/health'));
 save('models',{method:'GET',path:'/api/sectorial/models'},await get('/models'));
 save('companies_search',{method:'GET',path:'/api/sectorial/companies?q=QA&limit=5'},await get('/companies?q=QA&limit=5'));
 save('company_blocked_unresolved',{method:'GET',path:'/api/sectorial/companies/-101'},await get('/companies/-101'));
 save('company_conflict_pcv',{method:'GET',path:'/api/sectorial/companies/-102/pcv'},await get('/companies/-102/pcv'));
 save('company_conflict_kpis',{method:'GET',path:'/api/sectorial/companies/-102/kpis'},await get('/companies/-102/kpis'));
 const ex=(await get('/examples/4')).body;save('example_configuration_sector04',{method:'GET',path:'/api/sectorial/examples/4'},{status:200,body:ex});
 const run=await post('/companies/-4/evaluate',{asOf:ex.asOf,configuration:ex.configuration});save('evaluate_calculated_sector04',{method:'POST',path:'/api/sectorial/companies/-4/evaluate',body:{asOf:ex.asOf,configuration:'<ver example_configuration_sector04>'}},run);
 save('run_capital_sector04',{method:'GET',path:'/api/sectorial/runs/<id>/capital'},await get('/runs/'+run.body.id+'/capital'));
 save('premium_simulation_sector04',{method:'POST',path:'/api/sectorial/runs/<id>/premium-simulation',body:{factor:'LIQUIDEZ',premium:0.01,reason:'Sensibilidad'}},await post('/runs/'+run.body.id+'/premium-simulation',{factor:'LIQUIDEZ',premium:0.01,reason:'Sensibilidad'}));
 const blocked=await get('/companies/-103');save('evaluate_blocked_missing',{method:'POST',path:'/api/sectorial/companies/-103/evaluate'},await post('/companies/-103/evaluate',{asOf:'2026-03-31',configuration:{companyId:-103,inputHash:blocked.body.snapshot.inputHash}}));
 save('export_not_validated',{method:'GET',path:'/api/sectorial/runs/<id>/xlsx'},await get('/runs/'+run.body.id+'/xlsx'));
 save('error_stale_hash',{method:'POST',path:'/api/sectorial/companies/-4/evaluate'},await post('/companies/-4/evaluate',{asOf:ex.asOf,configuration:{...ex.configuration,inputHash:'0'.repeat(64)}}));
 save('error_no_token',{method:'POST',path:'/api/sectorial/companies/-4/evaluate',headers:'sin X-Sectorial-Token'},await post('/companies/-4/evaluate',{},''));
 save('taxonomy',{method:'GET',path:'/api/sectorial/taxonomy'},await get('/taxonomy'));
 await app.close();console.log(JSON.stringify({files:fs.readdirSync(out).length}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
