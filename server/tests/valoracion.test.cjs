const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const data=require('../dist/src/valoracion/datos');
const routes=require('../dist/src/valoracion/rutas');
const {opcionesCli}=require('../dist/valoracionAutomatica');
const {ejecutarLote,guardarProgreso}=require('../dist/src/valoracion/lotes');
const quality=routes.cargarCalidad();
const demo=()=>JSON.parse(fs.readFileSync(routes.rutaMotor('ejemplos/DEMO_NO_REAL.json')));
test('Rutas independientes del cwd: fuente y compilado',()=>{
  const original=process.cwd();try{for(const cwd of [routes.raizProyecto(),path.join(routes.raizProyecto(),'server'),os.tmpdir()]){process.chdir(cwd);assert.equal(routes.cargarMotor().valorar instanceof Function,true);assert.equal(routes.raizProyecto(path.join(routes.raizProyecto(),'server/src/valoracion')),routes.raizProyecto());}}finally{process.chdir(original);}
});
test('Fechas civiles y porcentajes: null no equivale a cero',()=>{
  assert.equal(quality.fechaCivil('2025-12-31'),'2025-12-31');assert.throws(()=>quality.fechaCivil('2025-02-30'));
  const {pctMysql}=require(routes.rutaMotor('dist/src/wacc'));
  for(const bad of [null,undefined,'',true])assert.throws(()=>pctMysql(bad,'ERP'));
  assert.equal(pctMysql('0','ERP'),0);assert.equal(quality.numeroDato(null,'DA',true),undefined);
});
test('Komatsu: reversión de reserva no se utiliza como depreciación',()=>{
  const r=data.normalizarPartidas([{concepto_estandar:'DEPRECIACION_AMORTIZACION',concepto:'jppfs_cor:ReversalOfReserveForSpecialDepreciation',importe:'-24000000',signo_esperado:'POSITIVO'}],'EDINET');
  assert.equal(r.valores.DEPRECIACION_AMORTIZACION,undefined);assert.equal(r.calidad.DEPRECIACION_AMORTIZACION.estado,'INVALIDO');
});
test('Identidades contables trazables; no reconstruir cuando faltan componentes',()=>{
  const rows=[['EBIT',100],['DEPRECIACION_AMORTIZACION',20],['CUENTAS_COBRAR',30],['INVENTARIOS',10],['CUENTAS_PAGAR',15]].map(([k,v])=>({concepto_estandar:k,concepto:k,importe:v,signo_esperado:'VARIABLE'}));
  const r=data.normalizarPartidas(rows,'SEC_EDGAR');assert.equal(r.valores.EBITDA,120);assert.equal(r.valores.CAPITAL_CIRCULANTE_OPERATIVO,25);assert.equal(r.valores.FCF,undefined);assert.equal(r.calidad.EBITDA.estado,'RECONSTRUIDO');
});
test('Sectores desconocidos no entran en FCFF; BANK y PHARMA existentes',()=>{
  const s=require('../dist/src/valoracion/motorServicio');assert.throws(()=>s.resolverConfiguracionFinanciera(221),/CLASIFICACION_PENDIENTE/);assert.equal(s.resolverConfiguracionFinanciera(16).valuationMethodFamily,'BANK');assert.equal(s.resolverConfiguracionFinanciera(137).valuationMethodFamily,'PHARMA');
});
test('Primas cero reproducibles, sin aprobación ficticia ni sobrescritura',()=>{
  const i=demo();delete i.risk_inputs;i.wacc_adjustments=data.primasCero('2026-10-12');i.premium_methodology='SYSTEM_DEFAULT_ZERO';
  const r=routes.cargarMotor().valorar(i);assert.equal(r.premium_methodology,'SYSTEM_DEFAULT_ZERO');assert.equal(r.validation_status,'REVIEW');assert.match(r.warnings.join(' '),/HIPOTESIS DEL SISTEMA/);
  i.risk_inputs=demo().risk_inputs;assert.throws(()=>routes.cargarMotor().valorar(i),/no puede sustituir/);
});
test('Huella determinista y sensible a cambios reales',()=>{assert.equal(data.huella({b:1,a:2}),data.huella({a:2,b:1}));assert.notEqual(data.huella({a:2}),data.huella({a:3}));assert.throws(()=>data.huella({a:NaN}));});
test('Worker rechaza binarios recompilados después de cargar el motor',()=>{
  routes.cargarMotor();const read=fs.readFileSync;
  try{
    fs.readFileSync=(file,...args)=>{const content=read(file,...args);if(String(file)===routes.rutaMotor('dist/build-manifest.json'))return JSON.stringify({...JSON.parse(content),compiledHash:'CAMBIO_SIMULADO_SOLO_EN_MEMORIA'});return content;};
    assert.throws(()=>routes.cargarMotor(),/reiniciar el worker/);
  }finally{fs.readFileSync=read;}
});
test('Validación: tres escenarios y bloqueo BANK no equivalen a calculado',()=>{
  const i=demo(),r=routes.cargarMotor().valorar(i);assert.equal(data.validarResultado(i,r),'COMPLETA_CON_ADVERTENCIAS');r.valuations.pop();assert.throws(()=>data.validarResultado(i,r));
  i.template_code='13';const b=routes.cargarMotor().valorar(i);assert.equal(data.validarResultado(i,b),'BLOQUEADA');assert.equal(b.valuations[0].fair_value,null);
});
test('CLI modo seguro predeterminado y opciones mutuamente exclusivas',()=>{assert.equal(opcionesCli([]).dryRun,true);assert.throws(()=>opcionesCli(['--write','--dry-run']));assert.throws(()=>opcionesCli(['--limit']));});
test('Lotes acotados continúan tras errores y reanudan cursor',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-batch-'));
  // Read-only mock instruments intentionally have missing data. No financial numbers fabricated.
  let fetches=0;const pool={query:async(sql,[cursor,,,limit])=>{fetches++;return [[1,2,3,4,5].filter(x=>x>cursor).slice(0,limit).map(id=>({id}))];},getConnection:async()=>({query:async()=>{throw new data.Pendiente('DATO_PENDIENTE','Fixture sin datos');},rollback:async()=>{},release(){}})};
  const opts={mode:'incremental',dryRun:true,resume:false,batchSize:2,limit:2,asOf:'2026-10-12',directory:dir};
  try{const a=await ejecutarLote(pool,opts);assert.equal(a.cursor,2);const b=await ejecutarLote(pool,{...opts,resume:true});assert.equal(b.cursor,4);assert.equal(b.processed,4);assert.ok(fetches<=3);assert.equal(fs.readFileSync(path.join(dir,'incidencias.jsonl'),'utf8').trim().split('\n').length,4);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Escala de 10.000 instrumentos pendientes: páginas y conexiones acotadas',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-scale-'));
  let live=0,maxLive=0,maxPage=0,fetches=0,peakHeap=process.memoryUsage().heapUsed;
  const total=10000,batchSize=100,baseline=peakHeap,started=performance.now();
  const pool={
    query:async(sql,[cursor,,,limit])=>{
      fetches++;const n=Math.min(limit,total-cursor);maxPage=Math.max(maxPage,n);
      return [Array.from({length:n},(_,j)=>({id:cursor+j+1}))];
    },
    getConnection:async()=>{
      live++;maxLive=Math.max(maxLive,live);
      return {query:async()=>{throw new data.Pendiente('DATO_PENDIENTE','Prueba de escala sin datos financieros');},rollback:async()=>{},release(){live--;peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);}};
    }
  };
  const log=console.log;console.log=()=>{};
  try{
    const p=await ejecutarLote(pool,{mode:'incremental',dryRun:true,resume:false,batchSize,asOf:'2026-10-12',directory:dir});
    assert.equal(p.processed,total);assert.equal(p.done,true);assert.equal(p.counts.DATOS_PENDIENTES,total);
    assert.equal(maxLive,1);assert.equal(live,0);assert.equal(maxPage,batchSize);assert.equal(fetches,101);
    assert.ok(peakHeap-baseline<64*1024*1024,'No acumular todos los resultados en memoria');
    const output={fixture:'10.000 IDs sintéticos sin datos financieros; no consulta MySQL',processed:p.processed,max_page:maxPage,max_live_connections:maxLive,heap_growth_bytes:peakHeap-baseline,duration_ms:Math.round(performance.now()-started)};
    const report=path.join(routes.raizProyecto(),'server/resultados_valoraciones/verificacion');fs.mkdirSync(report,{recursive:true});fs.writeFileSync(path.join(report,'escala.json'),JSON.stringify(output,null,2));
  }finally{console.log=log;fs.rmSync(dir,{recursive:true,force:true});}
});
test('Interrupción antes del primer instrumento conserva checkpoint reanudable',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-stop-'));let fetches=0;
  const pool={query:async()=>{fetches++;return [[]];}};
  const opts={mode:'incremental',dryRun:true,resume:false,batchSize:100,asOf:'2026-10-12',directory:dir,shouldStop:()=>true};
  try{
    const stopped=await ejecutarLote(pool,opts);assert.equal(stopped.done,false);assert.equal(fetches,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'progreso.json'))).cursor,0);
    const resumed=await ejecutarLote(pool,{...opts,resume:true,shouldStop:()=>false});assert.equal(resumed.done,true);assert.equal(fetches,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Checkpoint reintenta un bloqueo transitorio de Windows sin borrar el anterior',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-checkpoint-')),file=path.join(dir,'progreso.json');
  const rename=fs.renameSync;let attempts=0;
  try{
    fs.writeFileSync(file,JSON.stringify({cursor:1}));
    fs.renameSync=(...args)=>{if(++attempts===1){assert.equal(JSON.parse(fs.readFileSync(file)).cursor,1);throw Object.assign(new Error('Destino ocupado'),{code:'EPERM'});}return rename(...args);};
    await guardarProgreso(file,{cursor:2});assert.equal(attempts,2);assert.equal(JSON.parse(fs.readFileSync(file)).cursor,2);
  }finally{fs.renameSync=rename;fs.rmSync(dir,{recursive:true,force:true});}
});
