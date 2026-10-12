// Persist only instruments whose completed dry-run produced three numeric scenarios.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pool=require('../dist/conexion/bd').default;
const {prepararInstrumento,serializar,validarResultado,huella}=require('../dist/src/valoracion/datos');
const {cargarMotor}=require('../dist/src/valoracion/rutas');
const {conBloqueoInstrumento,persistirEnConexion}=require('../dist/src/valoracion/repositorio');
const {reproducirRun}=require('../dist/src/valoracion/replay');
const file=process.argv[2],offset=Number(process.argv[3]||0),limit=Number(process.argv[4]||1);
if(!file||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1)throw new Error('Uso: guardar-elegibles.cjs incidencias.jsonl offset limit');
(async()=>{
 const candidates=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse).filter(r=>r.state==='COMPLETA_CON_ADVERTENCIAS').slice(offset,offset+limit);
 const protectedTables=['empresa','instrumento','informe_financiero','partida_contable_valor','kpi_financiero_informe','valuation_input_version'];
 const checksums=async()=>Object.fromEntries((await pool.query('CHECKSUM TABLE '+protectedTables.join(',')))[0].map(r=>[r.Table,r.Checksum]));
 const before=await checksums();const [[max]]=await pool.query('SELECT MAX(id) id FROM valuation_run');const [historical]=await pool.query('SELECT * FROM valuation_run WHERE id<=? ORDER BY id',[max.id]);const beforeHash=huella(historical);
 const report={offset,limit,candidates:candidates.length,results:[],errors:[]};
 for(const candidate of candidates){try{
  const saved=await conBloqueoInstrumento(pool,candidate.instrumento_id,async c=>{
   await c.query('START TRANSACTION READ ONLY');let p;try{p=await prepararInstrumento(c,candidate.instrumento_id,'2026-10-12');await c.rollback();}catch(e){await c.rollback();throw e;}
   const computed=cargarMotor().valorar(p.input);assert.equal(validarResultado(p.input,computed),'COMPLETA_CON_ADVERTENCIAS');assert.equal(computed.validation_status,'REVIEW');
   const first=await persistirEnConexion(c,p,cargarMotor().valorar),second=await persistirEnConexion(c,p,cargarMotor().valorar,true);assert.equal(first.runId,second.runId);assert.equal(second.reused,true);
   const replay=await reproducirRun(c,first.runId);assert.equal(replay.reproduced,true);
   const [scenarios]=await c.query('SELECT escenario,validation_status FROM valuation_run_resultado WHERE valuation_run_id=?',[first.runId]);assert.equal(scenarios.length,3);assert.ok(scenarios.every(r=>r.validation_status==='REVIEW'));
   return {...first,result:undefined,replay:true,idempotent:true};
  });report.results.push({instrument_id:candidate.instrumento_id,ticker:candidate.ticker,...saved});
 }catch(e){report.errors.push({instrument_id:candidate.instrumento_id,message:e.message});}}
 assert.deepEqual(await checksums(),before,'Datos financieros originales intactos');const [afterHistorical]=await pool.query('SELECT * FROM valuation_run WHERE id<=? ORDER BY id',[max.id]);assert.equal(huella(afterHistorical),beforeHash,'Runs históricos intactos');report.originals_unchanged=true;
 fs.writeFileSync(path.resolve(__dirname,'../../private_backups','lote-'+offset+'-'+limit+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
