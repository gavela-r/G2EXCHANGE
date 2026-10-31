// KPI derivados de PCV históricos con certificación y cadena de evidencia. Las fórmulas replican
// server/insercionDatos/insercionKPIInformeFinanciero.ts (porcentajes ×100, |CapEx|, |D&A|, |intereses|).
// Estados: CERTIFICADO (todas las entradas VALIDADO) · BLOQUEADO_DEPENDENCIA (alguna entrada pendiente, conflictiva
// o ausente; nunca se usa cero) · NO_CALCULABLE (división por cero). Avisos: DENOMINADOR_NEGATIVO.
const pct=x=>x*100;
const KPIS=[
 {code:'MARGEN_BRUTO',unit:'PORCENTAJE',inputs:['grossProfit','revenue'],f:v=>pct(v.grossProfit/v.revenue),den:'revenue'},
 {code:'MARGEN_EBIT',unit:'PORCENTAJE',inputs:['ebit','revenue'],f:v=>pct(v.ebit/v.revenue),den:'revenue'},
 {code:'MARGEN_NETO',unit:'PORCENTAJE',inputs:['netIncome','revenue'],f:v=>pct(v.netIncome/v.revenue),den:'revenue'},
 {code:'ROA',unit:'PORCENTAJE',inputs:['netIncome','assets'],f:v=>pct(v.netIncome/v.assets),den:'assets'},
 {code:'ROE',unit:'PORCENTAJE',inputs:['netIncome','equity'],f:v=>pct(v.netIncome/v.equity),den:'equity'},
 {code:'DEUDA_TOTAL',unit:'MONEDA',inputs:['shortDebt','longDebt'],f:v=>v.shortDebt+v.longDebt},
 {code:'DEUDA_NETA',unit:'MONEDA',inputs:['shortDebt','longDebt','cash'],f:v=>v.shortDebt+v.longDebt-v.cash},
 {code:'DEUDA_SOBRE_PATRIMONIO',unit:'PORCENTAJE',inputs:['shortDebt','longDebt','equity'],f:v=>pct((v.shortDebt+v.longDebt)/v.equity),den:'equity'},
 {code:'DEUDA_SOBRE_ACTIVOS',unit:'PORCENTAJE',inputs:['shortDebt','longDebt','assets'],f:v=>pct((v.shortDebt+v.longDebt)/v.assets),den:'assets'},
 {code:'COBERTURA_INTERESES',unit:'VECES',inputs:['ebit','interest'],f:v=>v.ebit/Math.abs(v.interest),den:'interest'},
 {code:'EBITDA',unit:'MONEDA',inputs:['ebit','da'],f:v=>v.ebit+Math.abs(v.da)},
 {code:'MARGEN_EBITDA',unit:'PORCENTAJE',inputs:['ebit','da','revenue'],f:v=>pct((v.ebit+Math.abs(v.da))/v.revenue),den:'revenue'},
 {code:'FCF',unit:'MONEDA',inputs:['cfo','capex'],f:v=>v.cfo-Math.abs(v.capex)},
 {code:'MARGEN_FCF',unit:'PORCENTAJE',inputs:['cfo','capex','revenue'],f:v=>pct((v.cfo-Math.abs(v.capex))/v.revenue),den:'revenue'},
 {code:'CAPITAL_CIRCULANTE_OPERATIVO',unit:'MONEDA',inputs:['inventory','receivables','payables'],f:v=>v.inventory+v.receivables-v.payables},
 {code:'CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS',unit:'PORCENTAJE',inputs:['inventory','receivables','payables','revenue'],f:v=>pct((v.inventory+v.receivables-v.payables)/v.revenue),den:'revenue'},
 {code:'PASIVO_SOBRE_ACTIVOS',unit:'PORCENTAJE',inputs:['liabilities','assets'],f:v=>pct(v.liabilities/v.assets),den:'assets'}
];
function kpisForPeriod(period){
 return KPIS.map(k=>{
  const evidence=k.inputs.map(name=>{const f=period.fields?.[name];return{field:name,validation:f?.validation??'AUSENTE',value:f?.validation==='VALIDADO'?f.value:null,recordIds:f?.recordIds??[],verificationId:f?.verificationId??null,reason:f?.validation==='VALIDADO'?null:(f?.reason??'Concepto ausente')};});
  const base={code:k.code,unit:k.unit,periodEnd:period.periodEnd,fiscalYear:period.fiscalYear,currency:period.currency??null,publication:period.publication,document:period.document,provider:period.provider,inputs:evidence,warnings:[]};
  const blocked=evidence.filter(e=>e.validation!=='VALIDADO'||typeof e.value!=='number');
  if(blocked.length)return{...base,status:'BLOQUEADO_DEPENDENCIA',value:null,cause:blocked.map(e=>e.field+':'+e.validation).join(', ')};
  const v=Object.fromEntries(evidence.map(e=>[e.field,e.value]));
  if(k.den&&v[k.den]===0)return{...base,status:'NO_CALCULABLE',value:null,cause:'DIVISION_POR_CERO:'+k.den};
  const value=k.f(v);if(!Number.isFinite(value))return{...base,status:'NO_CALCULABLE',value:null,cause:'RESULTADO_NO_FINITO'};
  if(k.den&&v[k.den]<0)base.warnings.push('DENOMINADOR_NEGATIVO:'+k.den);
  return{...base,status:'CERTIFICADO',value,cause:null};
 });
}
const kpisForSnapshot=snapshot=>({company:snapshot.company,asOf:snapshot.asOf,inputHash:snapshot.inputHash,definitions:KPIS.map(({code,unit,inputs})=>({code,unit,inputs})),periods:snapshot.periods.map(p=>({periodEnd:p.periodEnd,kpis:kpisForPeriod(p)}))});
module.exports={KPIS,kpisForPeriod,kpisForSnapshot};
