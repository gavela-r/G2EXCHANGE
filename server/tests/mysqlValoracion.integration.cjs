/** Explicit integration command only. Writes ONLY session-local TEMPORARY tables. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const pool=require('../dist/conexion/bd').default;
const {prepararInstrumento,huella,serializar}=require('../dist/src/valoracion/datos');
const {persistirEnConexion,conBloqueoInstrumento}=require('../dist/src/valoracion/repositorio');
const {cargarMotor,rutaMotor,raizProyecto}=require('../dist/src/valoracion/rutas');
const fixtureProfile={source:'INTEGRATION_DIAGNOSTIC: explicit rating profile, requires financial review',reference_date:'2026-10-12',perfil_rating:'GRANDE_NO_FINANCIERA'};
test('MySQL real: inputs; tablas temporales: persistencia, rollback, histórico, idempotencia y replay',async()=>{
  const c=await pool.getConnection();
  try{
    await c.query('START TRANSACTION READ ONLY');
    const [[before]]=await c.query('SELECT (SELECT COUNT(*) FROM valuation_run) runs,(SELECT COUNT(*) FROM valuation_run_resultado) resultados');
    const p=await prepararInstrumento(c,2308,'2026-10-12',fixtureProfile);
    assert.equal(p.input.instrument_id,2308);assert.equal(p.input.currency,'USD');assert.equal(p.input.financials[3].period_end_date,'2026-01-25');
    const base=cargarMotor().valorar(p.input);assert.equal(base.valuations.length,3);
    assert.match(base.warnings.join(' '),/dilución completa/);assert.match(base.warnings.join(' '),/unidades originales/);
    await assert.rejects(()=>prepararInstrumento(c,3415,'2026-10-12'),/CLASIFICACION_PENDIENTE/);
    await assert.rejects(()=>prepararInstrumento(c,7787,'2026-10-12'),/CLASIFICACION_PENDIENTE/);
    await assert.rejects(()=>prepararInstrumento(c,5101,'2026-10-12',fixtureProfile),/incompatibles|DATO_PENDIENTE/);
    const [originalVersions]=await c.query('SELECT * FROM valuation_input_version WHERE id IN (?,?,?,?)',p.versiones);
    const samples=[];
    for(const condition of ["i.id=5198","p.codigo_iso='TW' AND e.sector_id=56","e.sector_id IN (6,10)"]){const [rows]=await c.query(`SELECT i.id,i.ticker,i.moneda,p.codigo_iso,e.sector_id FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE ${condition} ORDER BY i.id LIMIT 1`);samples.push(...rows);}
    const representative=[];const selected=new Set();
    for(const row of samples){const group=row.id===5198?'YOSHITAKE':row.codigo_iso==='TW'?'TAIWAN':'RESOURCE';if(selected.has(group))continue;selected.add(group);try{const candidate=await prepararInstrumento(c,row.id,'2026-10-12',fixtureProfile);const result=cargarMotor().valorar(candidate.input);representative.push({...row,status:result.validation_status});}catch(e){representative.push({...row,status:'PENDING',reason:e.message});}}
    await c.rollback();
    const [[db]]=await c.query('SELECT DATABASE() name');const schema='`'+db.name.replaceAll('`','``')+'`';
    for(const t of ['valuation_input_snapshot','valuation_input_snapshot_detalle','valuation_input_version','valuation_run','valuation_run_resultado','model_version']) {const [[row]]=await c.query('SHOW CREATE TABLE '+t);const ddl=row['Create Table'].replace('CREATE TABLE','CREATE TEMPORARY TABLE').replace(/\n  CONSTRAINT [^\n]+/g,'').replace(/,\s*\) ENGINE/,'\n) ENGINE');await c.query(ddl);}
    // Copy only original financial versions into temporary shadows, originals remain unchanged.
    for(const version of originalVersions)await c.query('INSERT INTO valuation_input_version SET ?',version);
    await c.query("INSERT INTO model_version(version,fecha_publicacion) VALUES ('1.5.1','2026-10-12')");
    const migration=fs.readFileSync(require('node:path').join(raizProyecto(),'server/sql/10_valoracion_reproducible.sql'),'utf8');
    const ddl=migration.slice(migration.indexOf('CREATE TABLE'),migration.indexOf(') ENGINE=InnoDB;')+') ENGINE=InnoDB;'.length).replace('CREATE TABLE','CREATE TEMPORARY TABLE').replace(/,\s*CONSTRAINT fk_execution_run[\s\S]*?\) ENGINE=InnoDB;/, '\n) ENGINE=InnoDB;');
    await c.query(ddl);
    await assert.rejects(()=>persistirEnConexion(c,p,()=>{throw new Error('Injected after snapshot/run');}),/Injected/);
    const [[rollback]]=await c.query('SELECT (SELECT COUNT(*) FROM valuation_run) runs,(SELECT COUNT(*) FROM valuation_input_snapshot) snapshots,(SELECT COUNT(*) FROM valuation_input_snapshot_detalle) detalles');assert.deepEqual(rollback,{runs:0,snapshots:0,detalles:0});
    const first=await persistirEnConexion(c,p,cargarMotor().valorar),second=await persistirEnConexion(c,p,cargarMotor().valorar);
    assert.equal(second.reused,true);assert.equal(first.runId,second.runId);
    const [[stored]]=await c.query('SELECT output_json FROM valuation_execution WHERE valuation_run_id=?',[first.runId]);assert.equal(stored.output_json,serializar(first.result));
    await assert.rejects(()=>c.query('UPDATE valuation_execution SET input_json=? WHERE valuation_run_id=?',['JSON INVALIDO',first.runId]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
    let replayCalls=0;
    const full=await persistirEnConexion(c,p,i=>{replayCalls++;return cargarMotor().valorar(i);},true);assert.equal(full.reused,true);assert.equal(replayCalls,1);
    await assert.rejects(()=>persistirEnConexion(c,p,i=>{const r=cargarMotor().valorar(i);r.valuations[0].fair_value+=1;return r;},true),/Replay difiere/);
    const [[count]]=await c.query('SELECT COUNT(*) n FROM valuation_run_resultado');assert.equal(count.n,3);
    const replay=await require(rutaMotor('dist/src/integracion/mysql_readonly')).exportarInputDesdeRun(c,first.runId,{templateCode:'03',instrumentId:2308});
    assert.deepEqual(cargarMotor().valorar(replay).valuations,first.result.valuations);
    const historicalReplay=await require('../dist/src/valoracion/replay').reproducirRun(c,first.runId);assert.equal(historicalReplay.reproduced,true);assert.deepEqual(historicalReplay.resultado,first.result);
    await assert.rejects(()=>require(rutaMotor('dist/src/integracion/mysql_readonly')).exportarInputDesdeRun(c,first.runId,{templateCode:'03',instrumentId:5198}),/Instrumento/);
    await assert.rejects(()=>require(rutaMotor('dist/src/integracion/mysql_readonly')).exportarInputDesdeRun(c,first.runId,{expectedEngineVersion:'1.2'}),/REPLAY_ENGINE_MISMATCH/);
    await assert.rejects(()=>require(rutaMotor('dist/src/integracion/mysql_readonly')).exportarInputDesdeRun(c,first.runId,{expectedManifestHash:'otro-binario'}),/REPLAY_MANIFEST_MISMATCH/);
    // Explicit sensitivity-test perturbation, not claimed as an observed market update.
    const update={...p,input:{...p.input,risk_free_rate:p.input.risk_free_rate+0.001},hash:huella({original:p.hash,sensitivity_test_rf:0.001})};
    const newer=await persistirEnConexion(c,update,cargarMotor().valorar);assert.notEqual(newer.runId,first.runId);
    const [[historical]]=await c.query('SELECT COUNT(*) n FROM valuation_run_resultado');assert.equal(historical.n,6);
    const blocked={...p,input:{...p.input,template_code:'13',sector_config_snapshot:JSON.parse(fs.readFileSync(rutaMotor('generator/sector_configs/13_bancos_servicios_financieros.json'))),sector_specific:undefined},trace:{...p.trace,family:'BANK'},hash:huella({blocked_fixture:p.hash})};
    const pending=await persistirEnConexion(c,blocked,cargarMotor().valorar);assert.equal(pending.financialState,'BLOQUEADA');
    const [[blockedCount]]=await c.query('SELECT COUNT(*) n FROM valuation_run_resultado WHERE valuation_run_id=?',[pending.runId]);assert.equal(blockedCount.n,0);
    const [[atomicBefore]]=await c.query('SELECT (SELECT COUNT(*) FROM valuation_run) runs,(SELECT COUNT(*) FROM valuation_input_snapshot) snapshots,(SELECT COUNT(*) FROM valuation_input_snapshot_detalle) detalles,(SELECT COUNT(*) FROM valuation_run_resultado) resultados,(SELECT COUNT(*) FROM valuation_execution) evidence');
    const originalQuery=c.query.bind(c);let inserted=0;
    c.query=(sql,args)=>{if(String(sql).startsWith('INSERT INTO valuation_run_resultado')&&++inserted===2)throw new Error('Injected second scenario');return originalQuery(sql,args);};
    try{await assert.rejects(()=>persistirEnConexion(c,{...p,hash:huella({partial_failure:p.hash})},cargarMotor().valorar),/Injected second/);}finally{c.query=originalQuery;}
    const [[atomic]]=await c.query('SELECT COUNT(*) n FROM valuation_run_resultado');assert.equal(atomic.n,6);
    const [[atomicAfter]]=await c.query('SELECT (SELECT COUNT(*) FROM valuation_run) runs,(SELECT COUNT(*) FROM valuation_input_snapshot) snapshots,(SELECT COUNT(*) FROM valuation_input_snapshot_detalle) detalles,(SELECT COUNT(*) FROM valuation_run_resultado) resultados,(SELECT COUNT(*) FROM valuation_execution) evidence');assert.deepEqual(atomicAfter,atomicBefore);
    const [[after]]=await pool.query('SELECT (SELECT COUNT(*) FROM valuation_run) runs,(SELECT COUNT(*) FROM valuation_run_resultado) resultados');assert.deepEqual(after,before);
    const output={production_unchanged:true,original_counts:before,temporary_results:historical.n,real_case:{instrumento_id:2308,currency:'USD',status:'REVIEW',profile:'EXPLICIT_DIAGNOSTIC',valuations:base.valuations.map(v=>({scenario:v.escenario,fair_value:v.fair_value,wacc:v.wacc}))},pending:['VRTX: N/A','USB: N/A','Komatsu: taxonomía incompatible'],representative,nvidia_reference_input_found:false};
    fs.mkdirSync(require('node:path').join(raizProyecto(),'server/resultados_valoraciones/verificacion'),{recursive:true});
    fs.writeFileSync(require('node:path').join(raizProyecto(),'server/resultados_valoraciones/verificacion/integracion.json'),JSON.stringify(output,null,2));
  }finally{c.destroy();}
});
test('MySQL: dos workers serializan el mismo instrumento',async()=>{
  const events=[];await Promise.all([conBloqueoInstrumento(pool,99999991,async()=>{events.push('first-start');await new Promise(r=>setTimeout(r,50));events.push('first-end');}),conBloqueoInstrumento(pool,99999991,async()=>{events.push('second-start');events.push('second-end');})]);
  assert.ok(events.indexOf('first-end')<events.indexOf('second-start')||events.indexOf('second-end')<events.indexOf('first-start'));
});
test.after(()=>pool.end());
