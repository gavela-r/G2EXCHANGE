import express,{Router} from 'express';
import type {Pool} from 'mysql2/promise';
import crypto from 'node:crypto';
import os from 'node:os';
import {DatosCapital} from './datos';
import {fechaCivil} from './fecha';
import {simularRun,validarMetodo,valorarConAprobados,VERSION} from './finanzas';
import {PROVEEDORES} from './proveedores';
import {METODOLOGIAS} from '../../../valuation_engine/research/coste_capital/src/evaluacion';
import {exportarExcel,exportarPdf} from './reportes';
import {manifiestoCapital} from './manifiesto';
import {simularPrimasAutomaticas} from './automatico';
const positive=(n:unknown)=>{const x=Number(n);if(!Number.isSafeInteger(x)||x<=0)throw Error('Identificador entero positivo requerido');return x;};
function actorLocal(){try{return `LOCAL:${os.userInfo().username}`;}catch{return `LOCAL:${process.env.USERNAME??'DESARROLLO_SIN_IDENTIDAD_VERIFICADA'}`;}}
function metodologiaRegistrada(row:any){
 const m=typeof row.calibration_json==='string'?JSON.parse(row.calibration_json):row.calibration_json;
 if(m.id!==row.id||m.version!==row.version||m.factor!==row.factor||m.estado!==row.status||m.evidenciaHash!==row.evidence_hash)throw Error('METODOLOGIA_NO_AUTORIZADA: registro, versión o evidencia incoherentes');
 return m;
}
export function capitalRouter(pool:Pool,options:{localReview:boolean;reviewToken?:string}){
 const router=Router(),data=new DatosCapital(pool),token=options.reviewToken??crypto.randomBytes(32).toString('hex');
 const wrap=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res)).catch(next);
 router.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):(5173|5174|3100)$/.test(origin)){res.status(403).json({error:'Origen no autorizado'});return;}
  if(req.method!=='GET'){
   if(!options.localReview&&!options.reviewToken){res.status(403).json({error:'Revisión no configurada'});return;}
   const actual=String(req.headers['x-capital-review-token']??'');
   if(actual.length!==token.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(token))){res.status(403).json({error:'Credencial de revisión requerida'});return;}
   try{manifiestoCapital();}catch(e){res.status(409).json({error:(e as Error).message});return;}
  }next();
 });
 router.get('/session',(_q,r)=>r.json({version:VERSION,mode:'DIAGNOSTICO_DESARROLLO',token:options.localReview?token:null,reviewEnabled:options.localReview||!!options.reviewToken,actor:options.localReview?actorLocal():'REVIEW_SERVICE'}));
 router.get('/companies',wrap(async(q:any,r:any)=>r.json(await data.empresas(String(q.query.q??'')))));
 router.get('/providers',(_q,r)=>r.json(PROVEEDORES));
 router.get('/methodologies',wrap(async(_q:any,r:any)=>{const [db]=await pool.query('SELECT id,version,status,factor,calibration_json,evidence_hash FROM capital_methodology');r.json({catalog:METODOLOGIAS,calibrations:db});}));
 router.get('/companies/:id',wrap(async(q:any,r:any)=>r.json(await data.diagnostico(positive(q.params.id),fechaCivil(q.query.asOf),q.query.periodEnd?fechaCivil(q.query.periodEnd):undefined))));
 router.get('/companies/:id/premiums',wrap(async(q:any,r:any)=>r.json((await data.diagnostico(positive(q.params.id),fechaCivil(q.query.asOf),q.query.periodEnd?fechaCivil(q.query.periodEnd):undefined)).primasAutomaticas)));
 router.get('/companies/:id/comparables',wrap(async(q:any,r:any)=>r.json(await data.comparables(positive(q.params.id),fechaCivil(q.query.asOf),q.query.periodEnd?fechaCivil(q.query.periodEnd):undefined))));
 router.post('/companies/:id/benchmarks',wrap(async(q:any,r:any)=>{
  const id=positive(q.params.id),day=fechaCivil(q.body.asOf),result=await data.comparables(id,day,q.body.periodEnd?fechaCivil(q.body.periodEnd):undefined,q.body.periodPolicy??'EXACT_PERIOD');
  r.status(201).json({...result,analysisId:await data.guardar('BENCHMARK',id,day,result)});
 }));
 router.post('/companies/:id/evaluations',wrap(async(q:any,r:any)=>{
  const id=positive(q.params.id),day=fechaCivil(q.body.asOf),payload=await data.diagnostico(id,day,q.body.periodEnd?fechaCivil(q.body.periodEnd):undefined);
  r.status(201).json({analysisId:await data.guardar('DIAGNOSTIC',id,day,payload),payload});
 }));
 router.get('/companies/:id/history',wrap(async(q:any,r:any)=>{const [rows]=await pool.query(`SELECT a.id,a.kind,a.as_of,a.created_at,a.content_hash,d.id decision_id,d.action,d.actor,d.reason,d.created_at decision_at FROM capital_analysis a LEFT JOIN capital_decision d ON d.analysis_id=a.id WHERE a.empresa_id=? ORDER BY a.id DESC,d.id DESC LIMIT 200`,[positive(q.params.id)]);r.json(rows);}));
 router.get('/companies/:id/proposals',wrap(async(q:any,r:any)=>{
  const [rows]:any=await pool.query("SELECT * FROM capital_analysis WHERE empresa_id=? AND kind='PROPOSAL' ORDER BY id DESC LIMIT 100",[positive(q.params.id)]);
  const proposals=[];for(const row of rows){const payload=typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload_json;const [methods]:any=await pool.query("SELECT status,version FROM capital_methodology WHERE id=?",[payload.methodologyId]);const [decisions]:any=await pool.query('SELECT action FROM capital_decision WHERE analysis_id=? ORDER BY id DESC LIMIT 1',[row.id]);proposals.push({id:row.id,date:row.as_of,payload,decision:decisions[0]?.action??null,methodologyStatus:methods[0]?.status??'ABSENT',canRequestApproval:methods[0]?.status==='APPROVED'});}r.json(proposals);
 }));
 router.post('/analyses/:id/decisions',wrap(async(q:any,r:any)=>{
  if(Object.keys(q.body).some(k=>!['action','reason','requestId','previousDecisionId'].includes(k)))throw Error('No se aceptan tasas ni metodologías enviadas por el cliente');
  const {action,reason,requestId,previousDecisionId=null}=q.body;
  if(!['APPROVED','REJECTED'].includes(action)||typeof reason!=='string'||reason.trim().length<3||reason.length>2000||typeof requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(requestId))throw Error('Decisión inválida');
  const c=await pool.getConnection();try{await c.beginTransaction();
   const [already]:any=await c.query('SELECT * FROM capital_decision WHERE request_id=?',[requestId]);
   if(already.length){if(already[0].analysis_id!==positive(q.params.id)||already[0].action!==action||already[0].reason!==reason)throw Error('Idempotency key reutilizada con contenido distinto');await c.commit();r.json(already[0]);return;}
   const [a]:any=await c.query('SELECT * FROM capital_analysis WHERE id=? FOR UPDATE',[positive(q.params.id)]);if(!a.length)throw Error('Evaluación inexistente');
   const [prev]:any=await c.query('SELECT id FROM capital_decision WHERE analysis_id=? ORDER BY id DESC LIMIT 1',[a[0].id]);if((prev[0]?.id??null)!==previousDecisionId)throw Error('Conflicto: decisión ha cambiado; refrescar historial');
   if(action==='APPROVED'){
    if(a[0].kind!=='PROPOSAL')throw Error('NO_ESTIMABLE: un diagnóstico no es una prima autorizable');
    const p=typeof a[0].payload_json==='string'?JSON.parse(a[0].payload_json):a[0].payload_json;
    const [m]:any=await c.query('SELECT * FROM capital_methodology WHERE id=? AND status=?',[p.methodologyId,'APPROVED']);
    if(m.length!==1)throw Error('Metodología no autorizada');const method=metodologiaRegistrada(m[0]);
    validarMetodo(method,a[0].as_of,p.market);
    if(!Number.isFinite(p.delta)||p.incorporacion!=='NO_INCORPORADO'||!p.evidence?.length)throw Error('Propuesta sin evidencia cuantitativa incremental');
    const [frozen]:any=await c.query('SELECT input_json,output_json FROM valuation_execution WHERE valuation_run_id=?',[a[0].parent_run_id]);
    if(frozen.length!==1)throw Error('La propuesta requiere ejecución de referencia congelada');
    const input=JSON.parse(frozen[0].input_json),output=JSON.parse(frozen[0].output_json);
    if(Number(input.company_id)!==a[0].empresa_id||input.valuation_date!==a[0].as_of||input.market!==p.market||!method.universo.includes(String(input.company_id)))throw Error('Universo/fecha/empresa de metodología incompatibles');
    valorarConAprobados(input,output,[{id:String(a[0].id),factor:method.factor,componente:p.component,tasa:{valor:p.delta,unidad:'FRACCION_ANUAL'},exposiciones:p.exposures,incorporacion:p.incorporacion,metodo:method,evidencia:p.evidence,referencia:p.reference,decision:{estado:'APPROVED',actor:'REVIEW_PENDING_TRANSACTION',fecha:new Date().toISOString().slice(0,10)}}]);
   }
   const actor=options.localReview?actorLocal():'CAPITAL_REVIEW_SERVICE';
   const [saved]:any=await c.query('INSERT INTO capital_decision(analysis_id,action,actor,reason,previous_decision_id,request_id) VALUES (?,?,?,?,?,?)',[a[0].id,action,actor,reason,previousDecisionId,requestId]);
   await c.commit();r.status(201).json({id:saved.insertId,action,actor});
  }catch(e){await c.rollback();throw e;}finally{c.release();}
 }));
 async function run(id:number){const [rows]:any=await pool.query('SELECT * FROM valuation_execution WHERE valuation_run_id=?',[id]);if(rows.length!==1)throw Error('Ejecución congelada inexistente');return {row:rows[0],input:JSON.parse(rows[0].input_json),output:JSON.parse(rows[0].output_json)};}
 router.post('/runs/:id/automatic-premiums',wrap(async(q:any,r:any)=>{
  if(Object.keys(q.body).length)throw Error('El cálculo automático no acepta coeficientes, tasas ni evidencias del cliente');
  const x=await run(positive(q.params.id));
  const diagnostic=await data.diagnostico(Number(x.input.company_id),x.input.valuation_date);
  const methods=await data.metodosPrecio();
  const preliminary=simularPrimasAutomaticas(x.input,x.output,diagnostic,methods,x.row.input_hash);
  const approved=[],proposalIds=[];
  for(const p of preliminary.primasAutomaticas.primas){
   if(!p.propuesta||p.primaCalculada===0)continue;
   const id=await data.guardar('PROPOSAL',Number(x.input.company_id),x.input.valuation_date,p.propuesta,x.row.valuation_run_id);proposalIds.push(id);
   const [[decision]]:any=await pool.query('SELECT * FROM capital_decision WHERE analysis_id=? ORDER BY id DESC LIMIT 1',[id]);
   if(decision?.action==='APPROVED'){
    const method=methods.find(m=>m.id===p.metodologiaId)!;
    approved.push({id:String(id),factor:method.factor,componente:p.componente,tasa:{valor:p.primaCalculada!,unidad:'FRACCION_ANUAL' as const},exposiciones:p.propuesta.exposures,incorporacion:p.propuesta.incorporacion,metodo:method,evidencia:p.evidencia,referencia:p.propuesta.reference,decision:{estado:'APPROVED' as const,actor:decision.actor,fecha:String(decision.created_at).slice(0,10)}});
   }
  }
  const result={...simularPrimasAutomaticas(x.input,x.output,diagnostic,methods,x.row.input_hash,approved),proposalIds,fuenteCongelada:{input:x.input,output:x.output,manifestHash:x.row.manifest_hash}};
  const analysisId=await data.guardar('SIMULATION',Number(x.input.company_id),x.input.valuation_date,result,x.row.valuation_run_id);
  r.status(201).json({analysisId,...result});
 }));
 router.get('/runs/:id',wrap(async(q:any,r:any)=>{const x=await run(positive(q.params.id));r.json({runId:x.row.valuation_run_id,inputHash:x.row.input_hash,engineVersion:x.row.engine_version,simulation:simularRun(x.input,x.output)});}));
 router.post('/runs/:id/authorized-simulations',wrap(async(q:any,r:any)=>{
  if(Object.keys(q.body).some(k=>k!=='proposalIds')||!Array.isArray(q.body.proposalIds)||q.body.proposalIds.length>20)throw Error('Sólo identificadores de propuestas del servidor');
  const x=await run(positive(q.params.id)),adjustments=[];
  for(const requested of q.body.proposalIds){const id=positive(requested);
   const [rs]:any=await pool.query(`SELECT a.*,d.action,d.actor,d.created_at decision_at FROM capital_analysis a JOIN capital_decision d ON d.id=(SELECT MAX(id) FROM capital_decision WHERE analysis_id=a.id) WHERE a.id=? AND a.kind='PROPOSAL' AND a.empresa_id=?`,[id,Number(x.input.company_id)]);
   if(rs.length!==1||rs[0].action!=='APPROVED')throw Error('Propuesta no aprobada para esta empresa');const row=rs[0],p=typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload_json;
   if(row.as_of!==x.input.valuation_date||p.market!==x.input.market)throw Error('Propuesta de otra fecha/mercado');
   const [ms]:any=await pool.query("SELECT * FROM capital_methodology WHERE id=? AND status='APPROVED'",[p.methodologyId]);if(ms.length!==1)throw Error('Metodología no autorizada');
   const method=metodologiaRegistrada(ms[0]);
   adjustments.push({id:String(row.id),factor:method.factor,componente:p.component,tasa:{valor:p.delta,unidad:'FRACCION_ANUAL' as const},exposiciones:p.exposures,incorporacion:p.incorporacion,metodo:method,evidencia:p.evidence,referencia:p.reference,decision:{estado:'APPROVED' as const,actor:row.actor,fecha:String(row.decision_at).slice(0,10)}});
  }
  const result=valorarConAprobados(x.input,x.output,adjustments),id=await data.guardar('SIMULATION',Number(x.input.company_id),x.input.valuation_date,result,x.row.valuation_run_id);
  r.status(201).json({analysisId:id,...result});
 }));
 router.post('/runs/:id/simulations',wrap(async(q:any,r:any)=>{
  if(Object.keys(q.body).some(k=>!['keBps','kdBps'].includes(k)))throw Error('Sólo hipótesis Ke/Kd; no autoriza primas');
  const ke=q.body.keBps??0,kd=q.body.kdBps??0;if(typeof ke!=='number'||typeof kd!=='number'||!Number.isFinite(ke)||!Number.isFinite(kd))throw Error('Hipótesis numéricas en puntos básicos requeridas');
  const x=await run(positive(q.params.id));const result={...simularRun(x.input,x.output,ke,kd),fuenteCongelada:{input:x.input,output:x.output,manifestHash:x.row.manifest_hash}};
  const id=await data.guardar('SIMULATION',Number(x.input.company_id),x.input.valuation_date,result,x.row.valuation_run_id);r.status(201).json({analysisId:id,...result});
 }));
 router.get('/analyses/:id/export/:format',wrap(async(q:any,r:any)=>{
  const [rows]:any=await pool.query('SELECT * FROM capital_analysis WHERE id=?',[positive(q.params.id)]);if(!rows.length)throw Error('Evaluación inexistente');const a=rows[0],payload=typeof a.payload_json==='string'?JSON.parse(a.payload_json):a.payload_json;
  const [decisions]=await pool.query('SELECT id,action,actor,reason,created_at FROM capital_decision WHERE analysis_id=? ORDER BY id',[a.id]);
  if(q.params.format==='xlsx'){r.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`G2_Capital_${a.id}.xlsx`).send(exportarExcel(payload,decisions));}
  else if(q.params.format==='pdf'){r.type('application/pdf').attachment(`G2_Capital_${a.id}.pdf`).send(exportarPdf(payload,decisions));}
  else if(q.params.format==='json')r.type('application/json').attachment(`G2_Capital_${a.id}.json`).send(JSON.stringify({analysis:a,payload,decisions}));
  else throw Error('Formato no admitido');
 }));
 router.use((err:any,_q:any,r:any,_next:any)=>{const message=String(err?.message??'Error de integración');r.status(/inexistente/.test(message)?404:/NO_ESTIMABLE|autorizad|Conflicto/.test(message)?409:400).json({error:message});});
 return router;
}
