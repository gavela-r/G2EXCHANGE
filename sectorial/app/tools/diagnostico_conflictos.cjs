// Diagnóstico de causas de los conflictos de verificación (CONFLICT_PRESERVED) de la fuente primaria, por celda
// (informe × concepto), para US (SEC_EDGAR) y JP (EDINET), 2022-2025. MySQL SÓLO LECTURA. No escribe en MySQL.
//
// Causas medidas (pruebas reproducibles, nunca coincidencia de importes sin más):
//  ORIGINAL_DE_OTRO_PERIODO   los originales distintos del candidato coinciden EXACTAMENTE con el candidato primario
//                             del mismo concepto y empresa para OTRO cierre (comparativo mal periodizado).
//  SEC_OTRO_PERIODO           (US) companyfacts de la SEC prueba que cada original distinto es el valor 10-K del mismo
//                             tag para un cierre ANTERIOR (fecha de fin distinta del cierre del informe).
//  SEC_MISMO_PERIODO_OTRA_PRESENTACION (US) el original es el valor del mismo cierre en otra presentación
//                             (reexpresión / comparativo posterior). Requiere decisión de versión: no se corrige.
//  DUPLICADOS_UNO_COINCIDE, MISMO_IMPORTE_*, ESCALA, SIGNO, REDONDEO_MENOR_0_05PCT, SIN_EXPLICAR.
//
// Además genera el registro de correcciones (`--ledger <archivo.ndjson>`, fuera del repositorio), con reglas
// versionadas (REGLAS) que deciden qué celdas serían certificables tras corregir un error reproducible:
//  US_PERIODO_V1        candidato SEC con contexto verificado (fin = cierre, no comparativo) y TODOS los originales
//                       distintos probados (MySQL o companyfacts) como valores de OTRO cierre. Valor = candidato.
//  JP_RESUMEN_MISMO_DOC_V1 al menos un original coincide exactamente (mismo tag) y los demás son el mismo concepto en
//                       la sección «主要な経営指標等の推移» del MISMO documento (tag = <tag candidato>SummaryOfBusinessResults,
//                       espacio jpcrp_cor) con importe idéntico.
//  JP_SIGNO_CANONICO_V1 CAPEX / DIVIDENDOS_PAGADOS (forma canónica en valor absoluto, pcv-complementos-politica.cjs),
//                       mismo tag exacto y |original| = |candidato|.
// Las celdas con otra causa siguen en conflicto. No se cambia la regla de certificación de MySQL.
// Uso: G2_PROJECT_ROOT=<proyecto> [G2_SEC_COMPANYFACTS_DIR=<dir>] node tools/diagnostico_conflictos.cjs [salida.json] [--ledger f.ndjson]
const fs=require('node:fs'),path=require('node:path');
const{database}=require('../runtime.cjs');
const YEARS=[2022,2023,2024,2025],PROVIDER={US:'SEC_EDGAR',JP:'EDINET'};
const REGLAS={US_PERIODO_V1:'2026-10-31',JP_RESUMEN_MISMO_DOC_V1:'2026-10-31',JP_SIGNO_CANONICO_V1:'2026-10-31'};
const ABSOLUTOS=new Set(['CAPEX','DIVIDENDOS_PAGADOS']);
const num=v=>v===null||v===undefined||v===''?null:Number(v);
const localTag=t=>String(t??'').split(':').pop();
const js=v=>v==null?[]:typeof v==='string'?JSON.parse(v):v;

function clasificar(c,lookup){
 const cand=c.cand,origs=c.origs.filter(o=>o.importe!==null);
 if(!origs.length)return'SIN_ORIGINAL';
 const iguales=origs.filter(o=>o.importe===cand.importe);
 if(iguales.length&&iguales.some(o=>localTag(o.tag)===localTag(cand.tag)))return origs.length>iguales.length?'DUPLICADOS_UNO_COINCIDE':'MISMO_IMPORTE_MISMA_ETIQUETA';
 if(iguales.length)return origs.length>iguales.length?'DUPLICADOS_UNO_COINCIDE':'MISMO_IMPORTE_OTRA_ETIQUETA';
 const distintos=[...new Set(origs.map(o=>o.importe))],otros=lookup.get(c.empresa+'|'+c.concept);
 if(otros){const periodos=distintos.map(v=>[...otros.entries()].find(([end,vals])=>end!==cand.end&&vals.has(v))?.[0]??null);
  if(periodos.every(Boolean)){c.offsets=periodos.map(e=>Math.round((Date.parse(cand.end)-Date.parse(e))/31557600000));c.otroPeriodo=true;return'ORIGINAL_DE_OTRO_PERIODO';}}
 const v=distintos[0],r=cand.importe?v/cand.importe:null;
 if(distintos.length===1&&r!==null){
  if([1e3,1e6,1e-3,1e-6].some(k=>Math.abs(r/k-1)<1e-9))return'ESCALA';
  if(Math.abs(r+1)<1e-9)return'SIGNO';
  if(Math.abs(r-1)<0.0005)return'REDONDEO_MENOR_0_05PCT';
 }
 return'SIN_EXPLICAR';
}

// Prueba con companyfacts (SEC): a qué cierre y presentación 10-K pertenece cada original distinto del candidato.
function pruebaSec(c,facts){
 const unit=c.concept==='EPS_DILUIDO'?'USD/shares':c.concept==='ACCIONES_EN_CIRCULACION'?'shares':'USD';
 const series=facts?.facts?.['us-gaap']?.[localTag(c.cand.tag)]?.units?.[unit]??facts?.facts?.dei?.[localTag(c.cand.tag)]?.units?.[unit];
 if(!series)return null;
 const distintos=[...new Set(c.origs.filter(o=>o.importe!==null&&o.importe!==c.cand.importe).map(o=>o.importe))];
 if(!distintos.length)return null;
 const prueba=distintos.map(v=>{const hits=series.filter(f=>/^10-K/.test(f.form??'')&&Number(f.val)===v);
  if(hits.some(f=>f.end===c.fin))return{valor:v,tipo:'MISMO_PERIODO',accn:hits.find(f=>f.end===c.fin).accn};
  const otro=hits.find(f=>f.end<c.fin);return otro?{valor:v,tipo:'OTRO_PERIODO',end:otro.end,accn:otro.accn,mismaPresentacion:otro.accn===c.cand.accn}:null;});
 if(prueba.some(p=>!p))return{causa:null,prueba};
 if(prueba.some(p=>p.tipo==='MISMO_PERIODO'))return{causa:'SEC_MISMO_PERIODO_OTRA_PRESENTACION',prueba};
 return{causa:'SEC_OTRO_PERIODO',prueba};
}

function decidir(country,c){
 const contexto=c.cand.end===c.fin&&!c.cand.comparative&&c.cand.importe!==null;
 if(!contexto)return null;
 // Sólo el mecanismo probado: comparativos de 1 a 3 ejercicios ANTERIORES (un 10-K presenta 2 balances y 3 cuentas
 // de resultados/flujos). Coincidencias con cierres más lejanos o posteriores pueden ser casuales: no se corrigen.
 const anos=c=>Math.round((Date.parse(c.fin)-Date.parse(c.end))/31557600000);
 const porMysql=c.otroPeriodo&&c.offsets.every(o=>o>=1&&o<=3);
 const porSec=c.sec?.causa==='SEC_OTRO_PERIODO'&&c.sec.prueba.every(p=>{const o=anos({fin:c.fin,end:p.end});return o>=1&&o<=3;});
 if(country==='US'&&(porMysql||porSec))return{regla:'US_PERIODO_V1',valor:c.cand.importe,accion:'CORREGIR_VALOR_A_CANDIDATO_PRIMARIO'};
 if(country!=='JP')return null;
 const origs=c.origs.filter(o=>o.importe!==null),exactos=origs.filter(o=>o.tag===c.cand.tag&&o.importe===c.cand.importe);
 const resumen=o=>o.tag==='jpcrp_cor:'+localTag(c.cand.tag)+'SummaryOfBusinessResults'&&o.importe===c.cand.importe;
 if(exactos.length&&origs.every(o=>exactos.includes(o)||resumen(o)))return{regla:'JP_RESUMEN_MISMO_DOC_V1',valor:c.cand.importe,accion:'EQUIVALENCIA_DEFINIDA_SIN_CAMBIO_DE_VALOR'};
 if(ABSOLUTOS.has(c.concept)&&origs.length&&origs.every(o=>o.tag===c.cand.tag&&Math.abs(o.importe)===Math.abs(c.cand.importe)))return{regla:'JP_SIGNO_CANONICO_V1',valor:Math.abs(c.cand.importe),accion:'NORMALIZAR_SIGNO_CANONICO'};
 return null;
}

async function main(out,ledgerFile){
 const pool=database(),conn=await pool.getConnection(),result={generatedAt:new Date().toISOString(),source:'MYSQL_SOLO_LECTURA',rules:REGLAS,secCompanyfacts:process.env.G2_SEC_COMPANYFACTS_DIR?'LOCAL_BULK':'NO_DISPONIBLE',countries:{}};
 const ledger=ledgerFile?fs.createWriteStream(ledgerFile):null;
 try{
  await conn.query('SET SESSION MAX_EXECUTION_TIME=900000');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const q=async(sql,p=[])=>{if(!/^\s*SELECT\b/i.test(sql))throw Error('Sólo SELECT');return(await conn.query({sql,timeout:900000},p))[0];};
  for(const country of Object.keys(PROVIDER)){
   const rows=await q(`SELECT v.id,v.informe_id,i.empresa_id,YEAR(i.fecha_fin_periodo) y,DATE_FORMAT(i.fecha_fin_periodo,'%Y-%m-%d') fin,v.concept_code c,v.outcome,
     JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.evidence.candidate.importe')) ci,
     JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.evidence.candidate.concepto')) ct,
     JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.evidence.candidate.identifier')) ca,
     JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.evidence.candidate.evidence.end')) ce,
     JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.evidence.candidate.evidence.comparative')) cc,
     JSON_UNQUOTE(JSON_EXTRACT(v.evidence_json,'$.context.identity.cik')) cik,
     CASE WHEN v.outcome='CONFLICT_PRESERVED' THEN JSON_EXTRACT(v.evidence_json,'$.evidence.originals[*].importe') END oi,
     CASE WHEN v.outcome='CONFLICT_PRESERVED' THEN JSON_EXTRACT(v.evidence_json,'$.evidence.originals[*].concepto') END ot,
     CASE WHEN v.outcome='CONFLICT_PRESERVED' THEN JSON_EXTRACT(v.evidence_json,'$.evidence.originals[*].id') END oid
    FROM pcv_verification_evidence v JOIN informe_financiero i ON i.id=v.informe_id JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id
    WHERE p.codigo_iso=? AND v.provider=? AND v.outcome IN ('CONFLICT_PRESERVED','VERIFIED_EXISTING','INSERTED','NULL_FILLED') AND i.tipo_periodo='ANUAL'`,[country,PROVIDER[country]]);
   const lookup=new Map();
   for(const r of rows){const ci=num(r.ci);if(ci===null||!r.ce||r.cc==='true')continue;const k=r.empresa_id+'|'+r.c;if(!lookup.has(k))lookup.set(k,new Map());const m=lookup.get(k);if(!m.has(r.ce))m.set(r.ce,new Set());m.get(r.ce).add(ci);}
   const cells=new Map(),certified=new Set();
   for(const r of rows){const key=r.informe_id+'|'+r.c;if(r.outcome!=='CONFLICT_PRESERVED'){certified.add(key);continue;}
    if(cells.has(key)||!YEARS.includes(Number(r.y)))continue;const oi=js(r.oi),ot=js(r.ot),oid=js(r.oid);
    cells.set(key,{informe:r.informe_id,empresa:r.empresa_id,cik:r.cik,year:Number(r.y),fin:r.fin,concept:r.c,cand:{importe:num(r.ci),tag:r.ct,accn:r.ca,end:r.ce,comparative:r.cc==='true'},origs:oi.map((v,i)=>({id:oid[i]??null,importe:num(v),tag:ot[i]}))});}
   for(const c of cells.values())c.causa=clasificar(c,lookup);
   // Prueba SEC companyfacts para US (agrupado por CIK: cada archivo se lee una vez).
   const dir=process.env.G2_SEC_COMPANYFACTS_DIR;
   if(country==='US'&&dir){const porCik=new Map();for(const c of cells.values())if(c.cik&&['SIN_EXPLICAR','ORIGINAL_DE_OTRO_PERIODO'].includes(c.causa))(porCik.get(c.cik)??porCik.set(c.cik,[]).get(c.cik)).push(c);
    let n=0;for(const[cik,cs]of porCik){const f=path.join(dir,'CIK'+String(cik).padStart(10,'0')+'.json');let facts=null;try{facts=JSON.parse(fs.readFileSync(f,'utf8'));}catch{}
     for(const c of cs){c.sec=pruebaSec(c,facts);if(c.causa==='SIN_EXPLICAR'&&c.sec?.causa)c.causa=c.sec.causa;}
     if(++n%500===0)console.error('companyfacts',n,'/',porCik.size);}}
   const byYear={};
   for(const c of cells.values()){
    const y=(byYear[c.year]??={cells:0,byCause:{},byConcept:{},offsets:{},contextOk:0,certifiableByRule:{},examples:{}}),t=c.causa;
    y.cells++;y.byCause[t]=(y.byCause[t]??0)+1;(y.byConcept[c.concept]??={})[t]=(y.byConcept[c.concept][t]??0)+1;
    if(c.cand.end===c.fin&&!c.cand.comparative)y.contextOk++;
    for(const o of c.offsets??[])y.offsets[o]=(y.offsets[o]??0)+1;
    for(const p of c.sec?.prueba??[])if(p?.tipo==='OTRO_PERIODO'){const o=Math.round((Date.parse(c.fin)-Date.parse(p.end))/31557600000);y.offsets['sec_'+o]=(y.offsets['sec_'+o]??0)+1;if(p.mismaPresentacion)y.offsets.sec_misma_presentacion=(y.offsets.sec_misma_presentacion??0)+1;}
    const d=decidir(country,c);if(d){y.certifiableByRule[d.regla]=(y.certifiableByRule[d.regla]??0)+1;ledger?.write(JSON.stringify({country,informe_id:c.informe,concept:c.concept,year:c.year,fin:c.fin,rule:d.regla,ruleVersion:REGLAS[d.regla],action:d.accion,value:d.valor,candidate:c.cand,originals:c.origs,cause:t,secProof:c.sec?.prueba??null})+'\n');}
    if(!y.examples[t])y.examples[t]={informe:c.informe,concept:c.concept,fin:c.fin,candidate:c.cand,originals:c.origs.slice(0,4),offsets:c.offsets??null,sec:c.sec??null};
   }
   result.countries[country]={provider:PROVIDER[country],evidenceRows:rows.length,conflictCells:cells.size,cellsAlsoWithVerifiedEvidence:[...cells.keys()].filter(k=>certified.has(k)).length,byYear};
   console.error(country,'filas',rows.length,'celdas en conflicto',cells.size);
  }
  await conn.rollback();
 }finally{conn.release();await pool.end();if(ledger)await new Promise(r=>ledger.end(r));}
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));return result;
}
module.exports={clasificar,pruebaSec,decidir,localTag,REGLAS};
if(require.main===module){const a=process.argv.slice(2),li=a.indexOf('--ledger'),ledger=li>=0?path.resolve(a.splice(li,2)[1]):null;
 main(path.resolve(a[0]??path.join(__dirname,'../coverage/diagnostico_conflictos.json')),ledger).then(r=>{for(const[c,v]of Object.entries(r.countries))for(const[y,d]of Object.entries(v.byYear))console.log(c,y,d.cells,JSON.stringify(d.byCause),'reglas',JSON.stringify(d.certifiableByRule),'offsets',JSON.stringify(d.offsets));}).catch(e=>{console.error(e.message);process.exitCode=1;});}
