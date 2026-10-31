const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),cp=require('node:child_process');
require('./env.cjs');
const {database,readOnly}=require('./runtime.cjs'),adapter=require('./adapter.cjs'),{models,model}=require('./registry.cjs'),{evaluate}=require('./workflow.cjs'),store=require('./store.cjs'),{kpisForSnapshot}=require('./kpi.cjs'),taxonomy=require('./taxonomy.cjs');
const VERSION='G2_SECTORIAL_DEV_0.3';
// Errores tipados: {error:<mensaje legible>, code:<código estable>}. Nunca se devuelven valores ficticios.
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
function artifactToolAvailable(){let dir=__dirname;for(;;){if(fs.existsSync(path.join(dir,'node_modules','@oai','artifact-tool','package.json')))return true;const up=path.dirname(dir);if(up===dir)return false;dir=up;}}
// options.source: {mode, search(q), load(id,asOf)} para modo mock; por defecto, adaptador MySQL en transacción READ ONLY.
// options.corsOrigins: orígenes de desarrollo permitidos (lista blanca exacta); por defecto ninguno (usar el proxy de Vite).
function createApp(pool,options={}){
 const source=options.source??{mode:'MYSQL_SOLO_LECTURA',search:q=>readOnly(pool,db=>adapter.search(db,q)),load:(id,asOf)=>readOnly(pool,db=>adapter.loadCompany(db,id,asOf))};
 pool??=source.mode==='MYSQL_SOLO_LECTURA'?database():{end:async()=>{}};
 const cors=new Set(options.corsOrigins??String(process.env.G2_SECTORIAL_CORS_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean));
 const token=crypto.randomBytes(32).toString('hex'),jobs=new Map(),queue=[],startupHash=store.engineHash(),capabilities={xlsxGenerator:artifactToolAvailable()?'ARTIFACT_TOOL_INDITEX':'PORTABLE_SHEETJS',nativeValidation:process.platform==='win32'?'MICROSOFT_EXCEL_COM_SI_INSTALADO':'NO_DISPONIBLE_FUERA_DE_WINDOWS',downloadPolicy:'SOLO_XLSX_CON_VALIDACION_NATIVA_VIGENTE'};let active=null;
 const json=(res,status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));};
 const validated=file=>{try{const v=JSON.parse(fs.readFileSync(file+'.validation.json','utf8'));return v.status==='VALIDADO'&&v.sha256===crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}catch{return false;}};
 const body=async req=>{let bytes=0,text='';for await(const chunk of req){bytes+=chunk.length;if(bytes>2e6)fail(413,'SOLICITUD_DEMASIADO_GRANDE','Solicitud demasiado grande');text+=chunk;}try{return JSON.parse(text||'{}');}catch{fail(400,'JSON_INVALIDO','Cuerpo JSON inválido');}};
 const asOfParam=v=>{const x=v??new Date().toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||Number.isNaN(Date.parse(x+'T00:00:00Z')))fail(400,'FECHA_INVALIDA','asOf debe ser AAAA-MM-DD');return x;};
 const intParam=(v,def,min,max,name)=>{if(v==null)return def;const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)fail(400,'PARAMETRO_INVALIDO',name+' fuera de rango ['+min+','+max+']');return n;};
 const errorCode=text=>['RUN_VERSION_NO_ARCHIVADA','REPLAY_NO_COINCIDE','EXCEL_NATIVO_NO_DISPONIBLE','EXCEL_NATIVO_RECHAZADO','EXCEL_NATIVO_HASH_O_ESTADO_INVALIDO','PARIDAD_EXCEL_TS'].find(c=>text.includes(c))??'EXPORTACION_FALLIDA';
 function pump(){if(active||!queue.length)return;const job=queue.shift();active=job;job.status='GENERANDO';
  const worker=cp.spawn(process.execPath,[path.join(__dirname,'export-worker.mjs'),job.id],{cwd:__dirname,windowsHide:true,env:{...process.env,G2_SECTORIAL_AUDIT_ROOT:path.dirname(__dirname)},stdio:['ignore','pipe','pipe']});let errors='';worker.stdout.on('data',()=>{});worker.stderr.on('data',x=>{errors=(errors+x.toString()).slice(-2000);});worker.on('error',()=>{job.status='ERROR';job.code='GENERADOR_NO_INICIADO';job.error='No se pudo iniciar el generador';active=null;pump();});worker.on('close',code=>{if(active!==job)return;job.status=code===0?'COMPLETADO':'ERROR';if(code!==0){job.code=errorCode(errors);job.error=job.code==='RUN_VERSION_NO_ARCHIVADA'?'La ejecución no tiene código archivado para un replay exacto':job.code==='EXCEL_NATIVO_NO_DISPONIBLE'?'Sin Microsoft Excel en este equipo: el archivo no puede validarse ni descargarse':'No se pudo generar o validar el Excel; ver data/jobs/<id>.error.txt';}job.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(store.root,'jobs',job.id+'.json'),JSON.stringify(job,null,2));active=null;pump();});
 }
 async function replay(id){const run=store.load(id),dir=store.archivedEngine(run.engineHash),{evaluate:archived}=require(path.join(dir,'workflow.cjs')),x=archived(run.snapshot,run.configuration);if(x.result.resultHash!==run.result.resultHash)fail(500,'REPLAY_NO_COINCIDE','El replay no reproduce el resultado guardado');return{run,x};}
 // Simulación de prima: suma la prima a Ke mediante Rf en los tres escenarios (Ke=Rf+β·ERP es aditivo; Kd no cambia).
 // Nunca se persiste ni se aprueba: estado SIMULACION_NO_APROBADA.
 function simulatePremium(run,x,input){
  const premium=input.premium;if(typeof premium!=='number'||!Number.isFinite(premium)||premium<-0.05||premium>0.10)fail(400,'PRIMA_FUERA_DE_RANGO','premium debe ser un número entre -0,05 y 0,10 (fracción anual)');
  if(!['LIQUIDEZ','TAMANO','OTRO'].includes(input.factor))fail(400,'FACTOR_INVALIDO','factor: LIQUIDEZ | TAMANO | OTRO');if(!String(input.reason??'').trim())fail(400,'MOTIVO_REQUERIDO','reason es obligatorio');
  if(!x.plan)return{status:'NO_SIMULABLE',code:'SIN_PLAN',message:'El expediente no tiene modelo/calendario; no hay coste de capital que simular',scenarios:[]};
  const g=x.plan.grafo,out=(v,k)=>{const e=x.plan.salida[k]?.[0];if(!e)return null;const n=typeof e==='number'?e:v.get(e.ref);return typeof n==='number'?n:null;};
  const scenarios=[1,2,3].map(s=>{const base=g.evaluar({'control.case':s}),changes={'control.case':s};let complete=true;for(let i=0;i<5;i++){const n=g.indice.get('case.'+s+'.rf.'+i);if(typeof n?.valor!=='number'){complete=false;break;}changes[n.id]=n.valor+premium;}
   if(!complete)return{scenario:s,status:'NO_SIMULABLE',code:'COSTE_CAPITAL_INCOMPLETO',base:null,simulated:null};
   const sim=g.evaluar(changes),pick=v=>({ke:out(v,'ke'),wacc:x.result.model.family==='FCFF'?out(v,'wacc'):null,discountRate:out(v,'valuationRate'),valuePerShare:out(v,'price')});
   const b=pick(base),m=pick(sim);return{scenario:s,status:b.valuePerShare==null?'VALOR_NO_ESTIMABLE':'SIMULADO',base:b,simulated:m,delta:{ke:m.ke!=null&&b.ke!=null?m.ke-b.ke:null,valuePerShare:m.valuePerShare!=null&&b.valuePerShare!=null?m.valuePerShare-b.valuePerShare:null}};});
  return{status:'SIMULACION_NO_APROBADA',runId:run.id,runStatus:run.result.status,factor:input.factor,premium,reason:input.reason,method:'KE_MAS_PRIMA_VIA_RF',approved:false,persisted:false,scenarios};
 }
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin,corsHeaders=origin&&cors.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
  const send=(status,data)=>json(res,status,data,corsHeaders);
  try{
   if(!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host??''))fail(403,'HOST_NO_AUTORIZADO','Host no autorizado');
   const url=new URL(req.url,'http://'+req.headers.host),parts=url.pathname.split('/').filter(Boolean),api=url.pathname.startsWith('/api/sectorial/');
   if(origin&&origin!=='http://'+req.headers.host&&!cors.has(origin))fail(403,'ORIGEN_NO_AUTORIZADO','Origen no autorizado');
   if(req.method==='OPTIONS'&&origin&&cors.has(origin)){res.writeHead(204,{...corsHeaders,'Access-Control-Allow-Methods':'GET,POST','Access-Control-Allow-Headers':'Content-Type,X-Sectorial-Token','Access-Control-Max-Age':'600'});return res.end();}
   if(req.method!=='GET'){const supplied=String(req.headers['x-sectorial-token']??'');if(supplied.length!==token.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))fail(403,'SESION_LOCAL_REQUERIDA','Sesión local requerida');}
   if(url.pathname==='/api/sectorial/health'&&req.method==='GET')return send(200,{status:'OK',version:VERSION,mode:source.mode});
   if(url.pathname==='/api/sectorial/session'&&req.method==='GET')return send(200,{version:VERSION,mode:source.mode==='MYSQL_SOLO_LECTURA'?'DESARROLLO_AISLADO':source.mode,dataSource:source.mode,databaseWrites:false,token,engineHash:startupHash,buildStale:startupHash!==store.engineHash(),capabilities});
   if(api&&startupHash!==store.engineHash())fail(503,'CODIGO_CAMBIADO','El código de desarrollo cambió. Recargar este servicio antes de nuevos cálculos; no se mezclan versiones.');
   if(url.pathname==='/api/sectorial/models'&&req.method==='GET')return send(200,models);
   if(parts[2]==='models'&&parts.length===4&&req.method==='GET'){const m=model(parts[3]);if(!m)fail(404,'MODELO_INEXISTENTE','Modelo 1-16');return send(200,m);}
   if(url.pathname==='/api/sectorial/taxonomy'&&req.method==='GET')return send(200,taxonomy.describe());
   if(url.pathname==='/api/sectorial/coverage'&&req.method==='GET'){const file=path.join(__dirname,source.mode==='MYSQL_SOLO_LECTURA'?'coverage/cobertura_actual.json':'mocks/coverage.json');if(!fs.existsSync(file))fail(404,'COBERTURA_NO_CALCULADA','Ejecutar npm run sectorial:coverage (requiere MySQL de solo lectura)');return send(200,JSON.parse(fs.readFileSync(file,'utf8')));}
   if(url.pathname==='/api/sectorial/companies'&&req.method==='GET'){const q=url.searchParams.get('q')??'';if(q.length>100)fail(400,'BUSQUEDA_DEMASIADO_LARGA','q admite hasta 100 caracteres');const limit=intParam(url.searchParams.get('limit'),40,1,40,'limit'),offset=intParam(url.searchParams.get('offset'),0,0,39,'offset'),all=await source.search(q),items=all.slice(offset,offset+limit);return send(200,items);}
   if(parts[2]==='examples'&&parts.length===4&&req.method==='GET'){if(!source.example)fail(404,'SOLO_MODO_MOCK','Los ejemplos de configuración sólo existen en modo mock');return send(200,await source.example(intParam(parts[3],0,1,16,'sector')));}
   if(parts[0]==='api'&&parts[1]==='sectorial'&&parts[2]==='companies'&&/^-?\d+$/.test(parts[3]??'')){
    const id=Number(parts[3]);if(parts.length===5&&parts[4]==='history'&&req.method==='GET')return send(200,store.list(id));
    if(parts.length===4&&req.method==='GET'){const snapshot=await source.load(id,asOfParam(url.searchParams.get('asOf'))),evaluation=evaluate(snapshot);return send(200,{snapshot,result:evaluation.result});}
    if(parts.length===5&&parts[4]==='pcv'&&req.method==='GET'){const s=await source.load(id,asOfParam(url.searchParams.get('asOf')));return send(200,{company:s.company,asOf:s.asOf,inputHash:s.inputHash,periods:s.periods.map(p=>({periodEnd:p.periodEnd,fiscalYear:p.fiscalYear,publication:p.publication,document:p.document,provider:p.provider,currency:p.currency,basis:p.basis,norm:p.norm,fields:p.fields,observations:p.observations})),issues:s.issues});}
    if(parts.length===5&&parts[4]==='kpis'&&req.method==='GET')return send(200,kpisForSnapshot(await source.load(id,asOfParam(url.searchParams.get('asOf')))));
    if(parts.length===5&&parts[4]==='evaluate'&&req.method==='POST'){
     const input=await body(req);if(Object.keys(input).some(x=>!['asOf','configuration'].includes(x)))fail(400,'CAMPO_NO_ADMITIDO','El cliente no puede sustituir históricos, resultados o evidencia');
     const config=input.configuration??{},allowed=['companyId','inputHash','scenarios','constants','assets','calendar','terminalSource','valuationBridge','accountingPolicy','classification'];if(Object.keys(config).some(x=>!allowed.includes(x)))fail(400,'CAMPO_CONFIGURACION_NO_ADMITIDO','Campo de configuración no admitido');
     const snapshot=await source.load(id,asOfParam(input.asOf));if(config.inputHash!==snapshot.inputHash)fail(409,'DATOS_CAMBIADOS','Los datos cambiaron o falta su hash; volver a cargar antes de calcular');
     let evaluated;try{evaluated=evaluate(snapshot,config);}catch(e){fail(400,'CONFIGURACION_RECHAZADA',e.message);}const run=store.save(snapshot,config,evaluated.result);return send(201,{id:run.id,result:run.result});
    }
   }
   if(parts[0]==='api'&&parts[1]==='sectorial'&&parts[2]==='runs'&&parts[3]){
    if(!/^[a-f0-9]{64}$/.test(parts[3]))fail(400,'ID_EJECUCION_INVALIDO','Identificador de ejecución inválido');const id=parts[3],file=path.join(store.root,'exports',id+'.xlsx');
    if(!fs.existsSync(path.join(store.root,'runs',id+'.json')))fail(404,'EJECUCION_INEXISTENTE','Ejecución inexistente');
    if(parts.length===4&&req.method==='GET'){const run=store.load(id);return send(200,{id,result:run.result,createdAt:run.createdAt,engineHash:run.engineHash});}
    if(parts[4]==='capital'&&req.method==='GET'){const run=store.load(id);return send(200,{id,status:run.result.status,model:run.result.model?{id:run.result.model.id,family:run.result.model.family,method:run.result.model.method}:null,capitalModule:run.result.capitalModule,scenarios:run.result.scenarios.map(s=>({id:s.id,name:s.name,status:s.status,ke:s.states?.ke?.[0]??null,kd:s.states?.kd?.[0]??null,wacc:run.result.model?.family==='FCFF'?s.states?.wacc?.[0]??null:null,discountRate:s.states?.valuationRate?.[0]??null,rates:s.capital.rates,premiums:s.capital.premiums,warnings:s.warnings}))});}
    if(parts[4]==='premium-simulation'&&req.method==='POST'){const input=await body(req),{run,x}=await replay(id);return send(200,simulatePremium(run,x,input));}
    if(parts[4]==='export'&&req.method==='POST'){
     store.load(id);if(validated(file))return send(200,{id,status:'COMPLETADO',url:'/api/sectorial/runs/'+id+'/xlsx'});
     if(fs.existsSync(file))fail(409,'ARCHIVO_SIN_VALIDACION','El archivo anterior no tiene validación nativa vigente. Se conserva como evidencia de QA.');
     let job=jobs.get(id);if(!job||job.status==='ERROR'){if(queue.length>=4)fail(429,'COLA_LLENA','Hay cuatro exportaciones pendientes; esperar a que termine una');job={id,status:'PENDIENTE',createdAt:new Date().toISOString()};jobs.set(id,job);queue.push(job);pump();}return send(202,job);
    }
    if(parts[4]==='job'&&req.method==='GET')return send(200,jobs.get(id)??(validated(file)?{id,status:'COMPLETADO'}:fs.existsSync(file)?{id,status:'ERROR',code:'ARCHIVO_SIN_VALIDACION',error:'Archivo sin validación nativa; no descargable'}:{id,status:'NO_SOLICITADO'}));
    if(parts[4]==='xlsx'&&req.method==='GET'){if(!validated(file))fail(409,'EXCEL_NO_DISPONIBLE','Excel no disponible: generación o validación nativa pendiente/fallida');res.writeHead(200,{...corsHeaders,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="G2_SECTORIAL_'+id.slice(0,12)+'.xlsx"','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return;}
    if(parts[4]==='json'&&req.method==='GET'){const run=store.load(id);return json(res,200,run,{...corsHeaders,'Content-Disposition':'attachment; filename="G2_SECTORIAL_'+id.slice(0,12)+'.json"'});}
   }
   if(url.pathname.startsWith('/api/'))fail(404,'RUTA_NO_DISPONIBLE','Ruta no disponible');
   if(req.method!=='GET')fail(405,'METODO_NO_ADMITIDO','Método no admitido');
   const publicRoot=path.join(__dirname,'public'),file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())fail(404,'ARCHIVO_NO_DISPONIBLE','Archivo no disponible');
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});fs.createReadStream(file).pipe(res);
  }catch(e){if(e instanceof ApiError)return send(e.status,{error:e.message,code:e.code});if(e.code==='ENOENT')return send(404,{error:'Recurso no disponible',code:'NO_ENCONTRADO'});if(e.code&&String(e.code).startsWith('ER_'))return send(503,{error:'Consulta MySQL no disponible ('+e.code+')',code:'MYSQL_NO_DISPONIBLE'});if(['ECONNREFUSED','ETIMEDOUT','ENOTFOUND'].includes(e.code))return send(503,{error:'MySQL no accesible',code:'MYSQL_NO_ACCESIBLE'});return send(400,{error:e.message,code:'SOLICITUD_RECHAZADA'});}
 });
 return{server,pool,jobs,close:()=>new Promise(resolve=>server.close(()=>pool.end().then(resolve)))};
}
async function start({mock=false,port=Number(process.env.G2_SECTORIAL_PORT??3200)}={}){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Puerto de desarrollo inválido');
 const options=mock?{source:await require('./mock.cjs').createMockSource()}:{};const app=createApp(null,options);
 app.server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({service:VERSION,url:'http://127.0.0.1:'+port,pid:process.pid,dataSource:options.source?.mode??'MYSQL_SOLO_LECTURA'})));
 app.server.on('error',e=>{console.error(e.code);void app.pool.end();process.exitCode=1;});process.on('SIGINT',()=>void app.close());process.on('SIGTERM',()=>void app.close());return app;
}
if(require.main===module)start({mock:process.argv.includes('--mock')||process.env.G2_SECTORIAL_MOCK==='1'});
module.exports={createApp,start,VERSION};
