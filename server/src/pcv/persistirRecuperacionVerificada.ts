import type {Pool,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import {createHash} from 'node:crypto';
import type {DatoPcv,InformePcv} from './normalizarProveedores';
import {normalizarPartidas,type Partida} from '../valoracion/datos';
import {kpiCalcularInforme} from '../../insercionDatos/insercionKPIInformeFinanciero';

export interface ContextoPcvVerificado {currency:'USD'|'JPY';basis:'consolidated'|'standalone';start:string;identity:Record<string,unknown>}
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const equal=(a:number,b:number)=>Math.abs(a-b)<=0.000051;
const DEBT=new Set(['DEUDA_TOTAL','DEUDA_NETA','DEUDA_SOBRE_PATRIMONIO','DEUDA_SOBRE_ACTIVOS']);

// Versioned policy: preserve every original PCV, isolate each discrepancy, and
// calculate only from stored values attested in the same official context.
export async function persistirRecuperacionVerificada(pool:Pool,i:InformePcv,datos:DatoPcv[],ctx:ContextoPcvVerificado,write:boolean){
 const c=await pool.getConnection(),result={pcv:0,kpiNew:0,kpiUpdated:0,conflicts:0,verified:0,rejected:0,precisionPending:0,byProvider:{} as Record<string,number>};
 if(ctx.currency!==(i.country==='US'?'USD':'JPY')||!['consolidated','standalone'].includes(ctx.basis)||!/^\d{4}-\d{2}-\d{2}$/.test(ctx.start)||!ctx.identity||!Object.keys(ctx.identity).length)throw Error('CONTEXTO_GLOBAL_NO_VERIFICADO');
 try{await c.beginTransaction();
  const [meta]=await c.query<RowDataPacket[]>("SELECT f.*,e.nombre_empresa,p.codigo_iso FROM informe_financiero f JOIN empresa e ON e.id=f.empresa_id JOIN pais p ON p.id=e.pais_id WHERE f.id=? FOR UPDATE",[i.id]);
  if(meta.length!==1||meta[0].empresa_id!==i.empresa_id||meta[0].fecha_fin_periodo!==i.end||meta[0].identificador_fuente!==i.accession||meta[0].codigo_iso!==i.country||meta[0].nombre_empresa!==i.nombre_empresa||meta[0].tipo_periodo!=='ANUAL')throw Error('INFORME_CAMBIO_DESDE_SELECCION');
  const [tax]=await c.query<RowDataPacket[]>('SELECT * FROM taxonomia_concepto WHERE activo=1'),map=new Map(tax.map(t=>[t.concepto_estandar,t]));
  const [initial]=await c.query<RowDataPacket[]>('SELECT pc.*,t.concepto_estandar,t.signo_esperado,t.alias_sec,t.alias_edinet,t.alias_finmind FROM partida_contable_valor pc LEFT JOIN taxonomia_concepto t ON t.id=pc.concepto_estandar_id WHERE pc.informe_id=? ORDER BY pc.id',[i.id]);
  const record=async(type:string,id:number,provider:string,code:string,before:unknown,after:unknown,evidence:unknown)=>{await c.query('INSERT INTO pcv_import_evidence(informe_id,record_type,record_id,provider,source_identifier,concept_code,evidence_json) VALUES(?,?,?,?,?,?,?)',[i.id,type,id,provider,i.accession,code,JSON.stringify({before,after,evidence,policy:'INDEPENDENT_FIELDS_ATTESTED_INPUTS_V1',observed_at:new Date().toISOString()})]);};
  const verify=async(code:string,provider:string,outcome:string,evidence:unknown)=>{const payload={policy:'INDEPENDENT_FIELDS_ATTESTED_INPUTS_V1',context:ctx,source_identifier:i.accession,outcome,evidence};await c.query('INSERT IGNORE INTO pcv_verification_evidence(informe_id,concept_code,provider,outcome,evidence_hash,evidence_json) VALUES(?,?,?,?,?,?)',[i.id,code,provider,outcome,digest(payload),JSON.stringify(payload)]);};
  const grouped=new Map<string,DatoPcv[]>();for(const d of datos){if(!map.has(d.codigo))continue;if(!grouped.has(d.codigo))grouped.set(d.codigo,[]);grouped.get(d.codigo)!.push(d);}
  const attested:Partida[]=[],attestedCodes=new Set<string>(),inputEvidence:unknown[]=[];
  for(const [code,ds]of grouped){const t=map.get(code)!,d=ds[0],old=initial.filter(r=>r.concepto_estandar===code),unit=code==='ACCIONES_EN_CIRCULACION'?'shares':code==='EPS_DILUIDO'?ctx.currency+'/shares':ctx.currency;
   const valid=ds.every(x=>Number.isFinite(x.importe)&&Math.abs(x.importe)<=Number.MAX_SAFE_INTEGER&&x.identifier===i.accession&&x.currency===unit&&(x.basis===ctx.basis||(code==='ACCIONES_EN_CIRCULACION'&&x.basis==='issuer_issued_shares'))&&x.evidence.end===i.end&&(t.categoria==='BALANCE'?!x.evidence.start:x.evidence.start===ctx.start));
   if(!valid){result.rejected++;await verify(code,d.provider,'REJECTED_CONTEXT',{candidates:ds,stored:old});continue;}
   if(new Set(ds.map(x=>x.importe)).size>1){result.conflicts++;await verify(code,d.provider,'AMBIGUOUS_CANDIDATES',{candidates:ds,stored:old});continue;}
   if(d.importe!==0&&Math.abs(d.importe)<0.00005){result.precisionPending++;await verify(code,d.provider,'PRECISION_PENDING',{candidate:d});continue;}
   const sourceRow={...t,concepto:d.concepto,importe:d.importe,concepto_estandar:code} as Partida;
   const normalized=normalizarPartidas([sourceRow],meta[0].fuente).valores[code];
   if(normalized===undefined){result.rejected++;await verify(code,d.provider,'REJECTED_NORMALIZATION',{candidate:d});continue;}
   const stored=old.filter(r=>r.importe!==null),matching:RowDataPacket[]=[];
   // Only an exact source tag (including an explicitly mapped supplemental
   // field) is attested. Similar amounts or labels do not establish equivalence.
   for(const r of stored){const sameTag=r.concepto===d.concepto||(!r.concepto.includes(':')&&r.concepto===d.concepto.split(':').pop())||(!d.concepto.includes(':')&&r.concepto==='us-gaap:'+d.concepto);if(!sameTag)continue;try{const value=normalizarPartidas([r as Partida],meta[0].fuente).valores[code];if(value!==undefined&&equal(value,normalized))matching.push(r);}catch{/* preserve, do not attest */}}
   let actual:Partida|undefined,actualId:number|undefined;
   if(stored.length){
    const disagree=stored.filter(r=>!matching.includes(r));if(disagree.length){result.conflicts++;await verify(code,d.provider,'CONFLICT_PRESERVED',{candidate:d,originals:stored,matching_ids:matching.map(x=>x.id)});}
    if(matching.length){actual=matching[0] as Partida;actualId=matching[0].id;result.verified++;await verify(code,d.provider,'VERIFIED_EXISTING',{candidate:d,record_ids:matching.map(x=>x.id)});}
   }else if(old.length>1){result.conflicts++;await verify(code,d.provider,'AMBIGUOUS_EMPTY_ROWS',{candidate:d,originals:old});}
   else{let id:number,before:unknown=null;
    if(old.length){id=old[0].id;before=old[0];await c.query('UPDATE partida_contable_valor SET concepto=?,importe=?,nivel_confianza=? WHERE id=? AND importe IS NULL',[d.concepto,d.importe,'ALTA',id]);}
    else{const [r]=await c.query<ResultSetHeader>('INSERT INTO partida_contable_valor(informe_id,concepto,concepto_estandar_id,importe,nivel_confianza) VALUES(?,?,?,?,?)',[i.id,d.concepto,t.id,d.importe,'ALTA']);id=r.insertId;}
    const [[saved]]=await c.query<RowDataPacket[]>('SELECT importe,concepto FROM partida_contable_valor WHERE id=?',[id]);
    await record('PCV',id,d.provider,code,before,saved,{...d,context:ctx,persistence_precision:'MYSQL_DECIMAL_24_4'});
    await verify(code,d.provider,before?'NULL_FILLED':'INSERTED',{candidate:d,record_id:id});
    result.pcv++;result.byProvider[d.provider]=(result.byProvider[d.provider]||0)+1;actual={...sourceRow,importe:saved.importe};actualId=id;
   }
   if(actual){attested.push(actual);attestedCodes.add(code);inputEvidence.push({code,record_id:actualId,source:d,stored_amount:actual.importe});}
  }
  const values=normalizarPartidas(attested,meta[0].fuente).valores;
  const unverifiedStoredDebt=initial.some(r=>['DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO'].includes(r.concepto_estandar)&&r.importe!==null&&!attestedCodes.has(r.concepto_estandar));
  const calculated=kpiCalcularInforme(i.id,values).filter(k=>!DEBT.has(k.kpi)||!unverifiedStoredDebt);
  const [existing]=await c.query<RowDataPacket[]>('SELECT * FROM kpi_financiero_informe WHERE informe_id=? FOR UPDATE',[i.id]);
  for(const k of calculated){if(k.valor===null||!Number.isFinite(k.valor))continue;const old=existing.find(x=>x.kpi===k.kpi);if(old&&old.valor!==null&&Math.abs(Number(old.valor)-k.valor)<=Math.max(0.00000000005,Math.abs(k.valor)*1e-12))continue;
   // Ratios may be below DECIMAL precision; do not turn a nonzero into zero.
   if(k.valor!==0&&Math.abs(k.valor)<0.00000000005){result.precisionPending++;continue;}
   let id:number;if(old){id=old.id;await c.query('UPDATE kpi_financiero_informe SET valor=?,unidad=?,nivel_confianza=?,fecha_calculo=CURRENT_TIMESTAMP WHERE id=?',[k.valor,k.unidad,k.nivelConfianza,id]);result.kpiUpdated++;}
   else{const [r]=await c.query<ResultSetHeader>('INSERT INTO kpi_financiero_informe(informe_id,kpi,valor,unidad,nivel_confianza,fecha_calculo) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)',[i.id,k.kpi,k.valor,k.unidad,k.nivelConfianza]);id=r.insertId;result.kpiNew++;}
   await record('KPI',id,'FORMULA_EXISTENTE',k.kpi,old||null,k,{context:ctx,formulaHash:digest(kpiCalcularInforme.toString()),inputsHash:digest(inputEvidence),inputs:inputEvidence});
  }
  if(write)await c.commit();else await c.rollback();return result;
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
