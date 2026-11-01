// Diagnostic only. A usable local value is not proof of issuer/period provenance.
const {normalizarPartidas}=require('../dist/src/valoracion/datos');
const {kpiCalcularInforme}=require('../dist/insercionDatos/insercionKPIInformeFinanciero');
const {filtrarKpiCalculables,deudaCompleta}=require('./pcv-prerrequisitos-kpi.cjs');
function diagnosticarPartidas(rows,source){
 const groups=new Map(),conflicts=[],invalid=[];
 for(const r of rows){if(!r.concepto_estandar)continue;const k=r.concepto_estandar.toUpperCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 let remaining=rows.filter(r=>r.concepto_estandar),normalized;
 // The engine checks its immutable build on every invocation. Retry only on
 // an actual conflict, rather than invoking it once per stored duplicate row.
 while(true){try{normalized=normalizarPartidas(remaining,source);break;}catch(e){
  const code=e.code==='TAXONOMIA_AMBIGUA'?String(e.message).split(':')[0]:null;
  if(!code||!groups.has(code)||conflicts.includes(code))throw e;
  conflicts.push(code);remaining=remaining.filter(r=>r.concepto_estandar.toUpperCase()!==code);
 }}
 const accepted=[];
 for(const [code,rs]of groups){if(conflicts.includes(code))continue;
  if(normalized.valores[code]===undefined)invalid.push(...rs.map(r=>({code,id:r.id,reasons:normalized.advertencias,quality:normalized.calidad[code]})));
  else accepted.push(rs.find(r=>r.importe!==null&&Number.isFinite(Number(r.importe)))||rs[0]);
 }
 return {...normalized,conflicts,invalid,accepted};
}
function diagnosticarKpi(id,rows,source,stored,expected){
 const n=diagnosticarPartidas(rows,source),calculated=filtrarKpiCalculables(kpiCalcularInforme(id,n.valores),n.valores),byCode=new Map(calculated.map(x=>[x.kpi,x])),states={};
 for(const code of expected){const old=stored.filter(x=>x.kpi===code&&x.valor!==null&&Number.isFinite(Number(x.valor))),calc=byCode.get(code);if(['DEUDA_TOTAL','DEUDA_NETA','DEUDA_SOBRE_PATRIMONIO','DEUDA_SOBRE_ACTIVOS'].includes(code)&&!deudaCompleta(n.valores)){states[code]=old.length?'STORED_WITH_INCOMPLETE_DEBT_COMPONENTS':'MISSING_DEBT_COMPONENTS';continue;}states[code]=!calc?(old.length?'STORED_NOT_REPRODUCIBLE':'MISSING_INPUT_OR_ZERO_DENOMINATOR'):!old.length?'CALCULABLE_MISSING':old.every(x=>Math.abs(Number(x.valor)-calc.valor)<=Math.max(0.00005,Math.abs(calc.valor)*1e-9))?'REPRODUCIBLE':'STORED_DISAGREES';}
 return {normalization:n,calculated,states};
}
module.exports={diagnosticarPartidas,diagnosticarKpi};
