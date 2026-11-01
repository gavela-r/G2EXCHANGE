const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {options,target,checkTarget}=require('./capital-dev.cjs');checkTarget();const mysql=require('../node_modules/mysql2/promise');
const root=path.resolve(__dirname,'../..'),{cargarMotorHistorico}=require('../dist/src/valoracion/rutas');
const {compararCongelado}=require('../dist-capital/server/src/capital/regresion');
const {DatosCapital}=require('../dist-capital/server/src/capital/datos');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
(async()=>{const source=await mysql.createConnection({...options(),database:process.env.DB_NAME}),dev=await mysql.createConnection({...options(),database:target}),pool=mysql.createPool({...options(),database:target,connectionLimit:2});
 try{await source.query('SET SESSION TRANSACTION READ ONLY');await source.query('SET SESSION MAX_EXECUTION_TIME=2500');await dev.query('SET SESSION TRANSACTION READ ONLY');
 const [runs]=await dev.query('SELECT * FROM valuation_execution ORDER BY valuation_run_id');const ids=runs.map(r=>r.valuation_run_id);
 const [originals]=await source.query('SELECT * FROM valuation_execution WHERE valuation_run_id IN (?) ORDER BY valuation_run_id',[ids]);
 const immutable={copied:runs.length,source:originals.length,identical:hash(runs)===hash(originals),sourceHash:hash(originals),devHash:hash(runs)};
 if(!immutable.identical)throw Error('La copia congelada difiere de la fuente: no sustituir datos');
 const replays=[];for(const r of runs){try{const input=JSON.parse(r.input_json),stored=JSON.parse(r.output_json),result=cargarMotorHistorico(r.manifest_hash,r.engine_version).valorar(input);const comparison=compararCongelado(stored,result,{input,output:stored});replays.push({run:r.valuation_run_id,status:comparison.exact?'MATCH':comparison.numericallyEquivalent?'IEEE754_EQUIVALENT':'FAIL',version:r.engine_version,comparison});}catch(e){replays.push({run:r.valuation_run_id,status:'FAIL',error:e.message});}}
 fs.writeFileSync(path.join(root,'valuation_engine/research/coste_capital/fase3/evidencias/replay.json'),JSON.stringify({at:new Date().toISOString(),immutable,replays},null,2));
 console.log(JSON.stringify({stage:'replay',match:replays.filter(r=>r.status==='MATCH').length,fail:replays.filter(r=>r.status==='FAIL').length}));
 const data=new DatosCapital(pool),[companies]=await dev.query("SELECT DISTINCT f.empresa_id FROM informe_financiero f ORDER BY f.empresa_id");
 const {calcularFinancieros}=require('../dist-capital/valuation_engine/research/coste_capital/src/indicadores');
 const coverage=[];for(const x of companies){const d=await data.diagnostico(x.empresa_id,'2026-10-29');const reports=[];
  for(const p of d.periodos){const firm=d.indicadores[0]?.empresa??{id:String(x.empresa_id),sector:'SIN_RESOLVER',pais:d.empresa.codigo_iso,region:d.empresa.codigo_iso,mercado:'SIN_RESOLVER',modeloNegocio:'SIN_RESOLVER',familia:'FCFF'};
   const metrics=calcularFinancieros(firm,'2026-10-29',p.moneda??'XXX',p.periodo);reports.push({period:p.periodo.fin,validIndicators:metrics.filter(i=>i.valor!==null).map(i=>i.id)});}
  coverage.push({empresaId:x.empresa_id,latest:d.periodoSeleccionado,latestValid:d.cobertura.validados,anyFinancial:reports.some(r=>r.validIndicators.length),anySize:reports.some(r=>r.validIndicators.includes('INGRESOS')&&r.validIndicators.includes('ACTIVOS_TOTALES')),reports,capitalization:d.capitalizacion.estado});
  if(coverage.length%10===0)console.log(JSON.stringify({stage:'coverage',companies:coverage.length,total:companies.length}));
 }
 const [market]=await dev.query("SELECT source,feed,COUNT(*) observations,COUNT(DISTINCT instrumento_id) instruments,MIN(session_date) firstDate,MAX(session_date) lastDate,SUM(share_volume IS NOT NULL) withVolume,SUM(traded_value IS NOT NULL) withValue FROM capital_daily_observation GROUP BY source,feed");
 const [[met]]=await dev.query("SELECT COUNT(*) methods,COUNT(CASE WHEN status='APPROVED' THEN 1 END) approved FROM capital_methodology");
 const [[originalCount]]=await source.query('SELECT COUNT(*) empresas FROM empresa');
 const engine=require(path.join(root,'valuation_engine/scripts/manifest.cjs')).current();
 const report={at:new Date().toISOString(),database:target,productionReadOnly:true,immutable,replays,coverage,market,methodologies:met,registeredCompaniesSource:originalCount.empresas,
 totals:{financialCompaniesInCopy:companies.length,withAnyValidatedFinancial:coverage.filter(c=>c.anyFinancial).length,withLatestValidatedFinancial:coverage.filter(c=>c.latestValid>0).length,withAnyValidatedSize:coverage.filter(c=>c.anySize).length,capitalizationValidated:coverage.filter(c=>c.capitalization==='CAPITALIZACION_VALIDADA').length,amihudCalculable:0,amihudReason:'Almacén nuevo sin ventanas completas ni ajustes corporativos/calendario acreditados'},legacyEngineManifest:engine};
 const out=path.join(root,'valuation_engine/research/coste_capital/fase3/evidencias/verificacion-real.json');fs.writeFileSync(out,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,replays:{match:replays.filter(r=>r.status==='MATCH').length,fail:replays.filter(r=>r.status==='FAIL')},coverage:undefined,legacyEngineManifest:undefined}));if(replays.some(r=>r.status==='FAIL'))process.exitCode=1;
 }finally{await source.end();await dev.end();await pool.end();}})().catch(e=>{console.error(e.code||e.stack);process.exitCode=1;});
