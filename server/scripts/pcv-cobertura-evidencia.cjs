// Counts only current stored rows independently attested to an exact source.
// KPI certification requires a complete, coherent input cohort and the existing
// formula; a stored numeric result alone is never source certification.
const {diagnosticarPartidas}=require('./pcv-cobertura-modelo.cjs');
const {kpiCalcularInforme}=require('../dist/insercionDatos/insercionKPIInformeFinanciero');
const DEBT=new Set(['DEUDA_TOTAL','DEUDA_NETA','DEUDA_SOBRE_PATRIMONIO','DEUDA_SOBRE_ACTIVOS']);
const parsed=value=>typeof value==='string'?JSON.parse(value):value;
function certificarInforme(report,rows,stored,evidence,expected){
 const cohorts=new Map(),byId=new Map(rows.map(r=>[r.id,r])),pcv=new Set(),kpi=new Set();
 for(const e of evidence){
  if(!expected.includes(e.concept_code)||e.currency!==(report.codigo_iso==='US'?'USD':'JPY')||!['consolidated','standalone'].includes(e.basis)||!/^\d{4}-\d{2}-\d{2}$/.test(e.start||'')||e.source_identifier!==report.identificador_fuente||e.end!==report.fecha_fin_periodo||e.candidate_basis!==e.basis)continue;
  const unit=e.concept_code==='ACCIONES_EN_CIRCULACION'?'shares':e.concept_code==='EPS_DILUIDO'?e.currency+'/shares':e.currency;if(e.unit!==unit)continue;
  const key=JSON.stringify([e.currency,e.basis,e.start,e.document_identifier||e.source_identifier]);if(!cohorts.has(key))cohorts.set(key,new Map());
  const ids=e.record_id?[Number(e.record_id)]:parsed(e.record_ids||'[]');
  for(const id of ids){const row=byId.get(Number(id));if(!row||row.importe===null||row.concepto_estandar!==e.concept_code||!Number.isFinite(Number(row.importe))||!Number.isFinite(Number(e.candidate_amount)))continue;
   if(row.categoria==='BALANCE'?e.candidate_start!==null:e.candidate_start!==e.start)continue;
   const sameTag=row.concepto===e.candidate_tag||(!row.concepto.includes(':')&&row.concepto===e.candidate_tag.split(':').pop())||(!e.candidate_tag.includes(':')&&row.concepto==='us-gaap:'+e.candidate_tag);if(!sameTag)continue;
   // The persistence policy already records normalization equality. Recheck
   // it here using the current row and the untouched current normalizer.
   cohorts.get(key).set(e.concept_code,{row,candidate:{...row,concepto:e.candidate_tag,importe:e.candidate_amount}});break;
  }
 }
 let coherentCohorts=0;
 for(const entries of cohorts.values()){
  const pairs=[...entries.values()],actual=diagnosticarPartidas(pairs.map(p=>p.row),report.fuente).valores,source=diagnosticarPartidas(pairs.map(p=>p.candidate),report.fuente).valores,values={};
  for(const [code]of entries){if(actual[code]!==undefined&&source[code]!==undefined&&Math.abs(actual[code]-source[code])<=0.000051){values[code]=actual[code];pcv.add(code);}}
  if(!Object.keys(values).length)continue;coherentCohorts++;
  const unverifiedDebt=rows.some(r=>['DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO'].includes(r.concepto_estandar)&&r.importe!==null&&values[r.concepto_estandar]===undefined);
  for(const calc of kpiCalcularInforme(report.id,values)){if(!Number.isFinite(calc.valor)||unverifiedDebt&&DEBT.has(calc.kpi))continue;const old=stored.filter(r=>r.kpi===calc.kpi&&r.valor!==null&&Number.isFinite(Number(r.valor)));if(old.length&&old.every(r=>Math.abs(Number(r.valor)-calc.valor)<=Math.max(0.00000000005,Math.abs(calc.valor)*1e-12)))kpi.add(calc.kpi);}
 }
 return {pcv,kpi,coherentCohorts};
}
module.exports={certificarInforme};
