// Validaciones locales de integridad y coherencia de la auditoría; no consulta MySQL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ev=path.join(__dirname,'evidencias'),docs=path.resolve(__dirname,'../docs');
const load=n=>JSON.parse(fs.readFileSync(path.join(ev,n+'.json')));
const s=load('cobertura_resumen'),d=load('observaciones_financieras'),m=load('metadatos'),f=load('comprobaciones_finales'),integrity=load('integridad_final');
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
check(s.overall.denominatorCompanies===d.companies.length,'Denominador de empresas');
check(s.overall.reports===d.reports.length,'Población de informes');
check(new Set(d.reports.map(r=>r.id)).size===d.reports.length,'No duplicar informes por subdivisión');
check(s.byYear.length===15,'País×cinco ejercicios');
for(const co of ['US','JP','TW']){
  const x=s.byCountry[co];check(x.denominatorCompanies===d.companies.filter(c=>c.codigo_iso===co).length,'Denominador país');
  for(const v of Object.values(x.metrics)){check(v.eligibleCompanies<=v.storedCompanies,'Publicación no puede crear cobertura');check(v.storedCompanies<=x.denominatorCompanies,'Cobertura no supera universo');check(v.attestationMetadataCompanies<=v.eligibleCompanies,'Evidencia no supera disponibilidad');}
}
for(const [id,v]of Object.entries(s.overall.metrics)){
  check(v.eligibleCompanies===Object.values(s.byCountry).reduce((a,c)=>a+c.metrics[id].eligibleCompanies,0),'Conciliación por país de '+id);
  check(v.eligibleCompanies===new Set(d.reports.filter(r=>r.eligible&&r.metrics[id]).map(r=>r.empresa_id)).size,'Conteo único '+id);
}
for(const [id,b]of Object.entries(s.overall.bundles))check(b.nonfinancialResolved+b.familyPending+b.financialFamily===b.eligibleCompanies,'Familias del conjunto '+id);
check(d.reports.filter(r=>r.eligible).every(r=>r.publicacion&&r.publicacion>=r.fin&&r.publicacion<=s.asOf&&r.fin<=s.asOf),'Corte temporal');
check(m.quotes.totals[0].filas===m.quotes.totals[0].instrumentos,'Una fila por instrumento');
check(m.quotes.perInstrumentDistribution.length===1&&m.quotes.perInstrumentDistribution[0].fechas_distintas===1,'Una fecha por instrumento');
check(f.sample.length===60&&new Set(f.sample.map(r=>r.companyId)).size===60,'Muestra explícita de empresas diferentes');
check(integrity.protectedChanges.length===0&&integrity.manifestMatches,'Fuentes/plantillas/manifiesto protegidos');
const baseline=fs.readFileSync(path.resolve(__dirname,'../../../../server/sql/00_schema.sql'),'utf8');
const normalize=x=>x.replace(/AUTO_INCREMENT=\d+\s*/g,'').replace(/\r/g,'').trim().replace(/;$/,'');
const original=new Map([...baseline.matchAll(/CREATE TABLE `([^`]+)` \([\s\S]*?\) ENGINE=[^;]*;/g)].map(x=>[x[1],normalize(x[0])]));
const schemaDifferences=Object.entries(m.ddl).filter(([t,ddl])=>original.get(t)!==normalize(ddl)).map(([t])=>t);
check(schemaDifferences.length===0,'DDL real frente a fichero de fase 1');
const controls=new Set(['SET SESSION MAX_EXECUTION_TIME=2000','SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED','SET SESSION TRANSACTION READ ONLY','SET SESSION lock_wait_timeout=2','SET SESSION innodb_lock_wait_timeout=2','START TRANSACTION READ ONLY','ROLLBACK']);
const files=fs.readdirSync(ev).filter(n=>/^consultas_.*\.json$/.test(n));let reads=0,maxMs=0;
for(const file of files){for(const q of JSON.parse(fs.readFileSync(path.join(ev,file)))){
  check(controls.has(q.sql)||/^(SELECT|SHOW|EXPLAIN)\s/i.test(q.sql),'Solo SQL de lectura/control de sesión');
  check(!q.sql.includes(';'),'Sin sentencias múltiples');check(q.outcome==='OK','Consulta completada');
  if(/^(SELECT|SHOW|EXPLAIN)/.test(q.sql))reads++;maxMs=Math.max(maxMs,q.ms);
}}
const names=['10_AUDITORIA_MYSQL_REAL.md','11_AUDITORIA_COTIZACIONES.md','12_COBERTURA_LIQUIDEZ_TAMANO.md','13_FUENTES_GRATUITAS_PENDIENTES.md','14_PLAN_TECNICO_SIGUIENTE_FASE.md'];
for(const name of names){check(fs.existsSync(path.join(docs,name)),'Informe entregado');check(fs.readFileSync(path.join(docs,name),'utf8').length>1000,'Informe con contenido');}
const result={passed:true,checks,sqlReadStatementsLogged:reads,maxQueryMs:maxMs,schemaTablesCompared:Object.keys(m.ddl).length,schemaDifferences,
  originalFilesCompared:integrity.comparedFiles,protectedChanges:integrity.protectedChanges,manifestMatches:integrity.manifestMatches,
  reportPopulation:s.overall.reports,companyPopulation:s.overall.denominatorCompanies,
  note:'Validaciones de auditoría y documentos; no son nuevas pruebas del motor financiero ni estimaciones de primas.'};
fs.writeFileSync(path.join(ev,'verificacion_entrega.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
