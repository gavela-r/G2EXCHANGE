// Mide (SÓLO LECTURA) cuántas celdas CORE marcadas CONFLICT_PRESERVED no tienen discrepancia de importe: el candidato
// coincide exactamente (|Δ|≤0,000051, misma tolerancia que persistirRecuperacionVerificada.ts) con TODOS los originales
// y el conflicto procede sólo de etiquetas distintas. Propuesta de estado: CORROBORADO_IMPORTE_EXACTO (no certificado
// automáticamente; requiere aprobar la política). Escribe coverage/potencial_corroboracion.json.
const fs=require('node:fs'),path=require('node:path'),{database}=require('../runtime.cjs'),{CORE}=require('./cobertura_mysql.cjs');
const equal=(a,b)=>Math.abs(a-b)<=0.000051;
const corroborated=j=>{const c=Number(j?.evidence?.candidate?.importe),o=(j?.evidence?.originals??[]).map(x=>Number(x.importe??x.value));return Number.isFinite(c)&&o.length>0&&o.every(v=>Number.isFinite(v)&&equal(v,c));};
(async()=>{const cov=JSON.parse(fs.readFileSync(path.join(__dirname,'../coverage/cobertura_actual.json'),'utf8')),pool=database(),conn=await pool.getConnection(),rows=[];
 try{await conn.query('SET SESSION MAX_EXECUTION_TIME=180000');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  for(const country of['US','JP'])for(const year of[2022,2023,2024,2025]){
   const reports=(await conn.query({sql:`WITH ranked AS (SELECT inf.id informe_id,ROW_NUMBER() OVER(PARTITION BY inf.empresa_id ORDER BY inf.fecha_fin_periodo DESC,inf.fecha_publicacion DESC,inf.id DESC) rn FROM informe_financiero inf JOIN empresa e ON e.id=inf.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso=? AND inf.tipo_periodo='ANUAL' AND YEAR(inf.fecha_fin_periodo)=?) SELECT informe_id FROM ranked WHERE rn=1`,timeout:200000},[country,year]))[0].map(r=>Number(r.informe_id));
   const cell=new Map(),cert=new Set();
   for(let k=0;k<reports.length;k+=1500){const chunk=reports.slice(k,k+1500);
    for(const r of(await conn.query({sql:`SELECT informe_id,concept_code,outcome,evidence_json FROM pcv_verification_evidence WHERE informe_id IN (?) AND concept_code IN (?) AND outcome IN ('CONFLICT_PRESERVED','INSERTED','NULL_FILLED','VERIFIED_EXISTING')`,timeout:200000},[chunk,CORE]))[0]){const key=r.informe_id+'|'+r.concept_code;if(r.outcome!=='CONFLICT_PRESERVED'){cert.add(key);continue;}const j=typeof r.evidence_json==='string'?JSON.parse(r.evidence_json):r.evidence_json;const prev=cell.get(key)??true;cell.set(key,prev&&corroborated(j));}}
   const conflictCells=cell.size,onlyExact=[...cell.values()].filter(Boolean).length,base=cov.matrix.find(m=>m.country===country&&m.year===year);
   rows.push({country,year,conflictCells,conflictCellsExactAmount:onlyExact,conflictCellsRealDisagreement:conflictCells-onlyExact,currentCertifiedCoverage:base.pcv.certifiedCoverage,potentialCertifiedCoverageIfApproved:Number((100*(base.pcv.certified+onlyExact)/base.pcv.expected).toFixed(2))});
   console.log(country,year,'conflictos',conflictCells,'importe exacto',onlyExact,'cobertura',base.pcv.certifiedCoverage,'→',rows.at(-1).potentialCertifiedCoverageIfApproved);}
  await conn.rollback();}finally{conn.release();await pool.end();}
 fs.writeFileSync(path.join(__dirname,'../coverage/potencial_corroboracion.json'),JSON.stringify({generatedAt:new Date().toISOString(),rule:'CONFLICT_PRESERVED con importe idéntico en candidato y todos los originales (tolerancia 0,000051); conflicto sólo por etiqueta',status:'PROPUESTA_NO_APLICADA',rows},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
