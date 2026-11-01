// Ejecuta realmente la valoración adaptativa de empresas reales: carga en solo lectura (adapter.loadCompany), referencias
// de mercado de MySQL (bono a 10 años y prima de mercado del país, beta sectorial, último precio <= fecha de valoración),
// prepara la configuración (adaptativo.cjs), evalúa (workflow, modo ADAPTATIVO), guarda la ejecución con el motor
// archivado (store) y genera + valida el Excel por la ruta oficial (export-worker.mjs, validación nativa de Excel).
// Una empresa sólo cuenta como VALORADA si el flujo calcula los tres escenarios y su Excel queda VALIDADO.
// Uso: G2_PROJECT_ROOT=<proyecto con .env> node tools/valorar_adaptativo.cjs --ids 1,2 | --ids-file f.txt [--as-of 2026-10-31]
//        [--historicos h.json (referencia sectorial de crecimiento)] [--salida resultados.json] [--sin-excel]
const path=require('node:path'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const APP=path.resolve(__dirname,'..'),A=require(path.join(APP,'adapter.cjs')),{database,readOnly}=require(path.join(APP,'runtime.cjs')),{evaluate}=require(path.join(APP,'workflow.cjs')),store=require(path.join(APP,'store.cjs')),AD=require(path.join(APP,'adaptativo.cjs')),P=require(path.join(APP,'proyeccion.cjs'));
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:d;};
const {referencias}=AD;
function exportar(id){const r=cp.spawnSync(process.execPath,[path.join(APP,'export-worker.mjs'),id],{cwd:APP,env:{...process.env,G2_SECTORIAL_AUDIT_ROOT:path.dirname(APP)},encoding:'utf8',timeout:600000,windowsHide:true});
 const file=path.join(store.root,'exports',id+'.xlsx');let validacion=null;try{validacion=JSON.parse(fs.readFileSync(file+'.validation.json','utf8'));}catch{}
 const valido=validacion?.status==='VALIDADO'&&fs.existsSync(file)&&validacion.sha256===crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 return{codigo:r.status,salida:(r.stdout||'').trim().slice(-500),error:(r.stderr||'').trim().slice(-800),excel:valido?file:null,validacion:validacion?.status??null};}
(async()=>{
 const asOf=arg('--as-of','2026-10-31'),ids=arg('--ids-file')?fs.readFileSync(arg('--ids-file'),'utf8').split(/\s+/).map(Number).filter(Boolean):arg('--ids','').split(',').map(Number).filter(Boolean),hist=arg('--historicos')?JSON.parse(fs.readFileSync(arg('--historicos'),'utf8')):null;
 const pool=database(),out=[];
 for(const id of ids){const fila={id,asOf};
  try{const{snapshot,refs}=await readOnly(pool,async db=>{const snapshot=await A.loadCompany(db,id,asOf);return{snapshot,refs:await referencias(db,snapshot,asOf,hist)};});
   Object.assign(fila,{nombre:snapshot.company.nombre_empresa,pais:snapshot.company.codigo_iso,plantilla:snapshot.classification.model,ejercicios:snapshot.periods.map(p=>p.fiscalYear)});
   const prep=AD.preparar(snapshot,refs,{asOf});fila.cobertura=prep.traza.cobertura?.porcentaje??null;
   if(!prep.config){fila.estado='BLOQUEADO_PREPARACION';fila.bloqueos=prep.bloqueos;out.push(fila);console.log(JSON.stringify({id,estado:fila.estado,bloqueos:prep.bloqueos.map(b=>b.code+(b.field?':'+b.field:''))}));continue;}
   let x;try{x=evaluate(snapshot,prep.config);}catch(e){fila.estado='CONFIGURACION_RECHAZADA';fila.error=e.message;out.push(fila);console.log(JSON.stringify({id,estado:fila.estado,error:e.message}));continue;}
   const r=x.result;fila.estadoFlujo=r.status;fila.problemas=r.issues.map(i=>i.code+(i.field?':'+i.field:''));fila.escenarios=r.scenarios.map(s=>({nombre:s.name,estado:s.status,valorPorAccion:s.valuePerShare}));fila.precioMercado=refs.precio?.valor??null;fila.moneda=snapshot.periods.at(-1).currency;
   if(r.status!=='CALCULADO_PENDIENTE_REVISION'){fila.estado='FLUJO_BLOQUEADO';out.push(fila);console.log(JSON.stringify({id,estado:fila.estado,problemas:fila.problemas.slice(0,8),escenarios:fila.escenarios.map(s=>s.estado)}));continue;}
   const run=store.save(snapshot,prep.config,r);fila.ejecucion=run.id;
   if(process.argv.includes('--sin-excel')){fila.estado='CALCULADO_SIN_EXCEL';}else{const e=exportar(run.id);fila.excel=e.excel;fila.validacionExcel=e.validacion;fila.estado=e.excel?'VALORADA_EXCEL_VALIDADO':'EXCEL_NO_VALIDADO';if(!e.excel)fila.errorExcel=e.error||e.salida;}
   out.push(fila);console.log(JSON.stringify({id,nombre:fila.nombre,estado:fila.estado,valor:fila.escenarios.map(s=>s.valorPorAccion&&+s.valorPorAccion.toFixed(2)),precio:fila.precioMercado}));
  }catch(e){fila.estado='ERROR';fila.error=e.message;out.push(fila);console.log(JSON.stringify({id,estado:'ERROR',error:e.message}));}
 }
 if(arg('--salida'))fs.writeFileSync(arg('--salida'),JSON.stringify({asOf,version:AD.VERSION,resultados:out},null,1));await pool.end();
})().catch(e=>{console.error(e);process.exit(1);});
