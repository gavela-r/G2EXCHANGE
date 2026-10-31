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
 {code:'PASIVO_SOBRE_ACTIVOS',unit:'PORCENTAJE',inputs:['liabilities','assets'],f:v=>pct(v.liabilities/v.assets),den:'assets'},
 // Días operativos con saldos de CIERRE y 365 días por ejercicio anual. Metodología G2 original: denominador VENTAS.
 // Variante convencional diferenciada: DIO y DPO sobre COSTE DE VENTAS. Nunca se mezclan en una misma serie.
 // Los activos contractuales sólo entran en la métrica AMPLIADA, nunca en el DIO (sin doble cómputo).
 {code:'DSO',unit:'DIAS',inputs:['receivables','revenue'],f:v=>v.receivables/v.revenue*365,den:'revenue',method:'SOBRE_VENTAS'},
 {code:'DPO_SOBRE_VENTAS',unit:'DIAS',inputs:['payables','revenue'],f:v=>v.payables/v.revenue*365,den:'revenue',method:'SOBRE_VENTAS'},
 {code:'DIAS_INVENTARIO_SOBRE_VENTAS',unit:'DIAS',inputs:['inventory','revenue'],f:v=>v.inventory/v.revenue*365,den:'revenue',method:'SOBRE_VENTAS'},
 {code:'CCC_SOBRE_VENTAS',unit:'DIAS',inputs:['receivables','inventory','payables','revenue'],f:v=>(v.receivables+v.inventory-v.payables)/v.revenue*365,den:'revenue',method:'SOBRE_VENTAS'},
 {code:'DIAS_ACTIVOS_OPERATIVOS_AMPLIADOS_SOBRE_VENTAS',unit:'DIAS',inputs:['inventory','contractAssets','revenue'],f:v=>(v.inventory+v.contractAssets)/v.revenue*365,den:'revenue',method:'SOBRE_VENTAS'},
 {code:'DIO_SOBRE_COSTE',unit:'DIAS',inputs:['inventory','cogs'],f:v=>v.inventory/v.cogs*365,den:'cogs',method:'CONVENCIONAL'},
 {code:'DPO_SOBRE_COSTE',unit:'DIAS',inputs:['payables','cogs'],f:v=>v.payables/v.cogs*365,den:'cogs',method:'CONVENCIONAL'},
 {code:'CCC_CONVENCIONAL',unit:'DIAS',inputs:['receivables','revenue','inventory','payables','cogs'],f:v=>v.receivables/v.revenue*365+(v.inventory-v.payables)/v.cogs*365,dens:['revenue','cogs'],method:'CONVENCIONAL'}
];
function kpisForPeriod(period){
 return KPIS.map(k=>{
  const evidence=k.inputs.map(name=>{const f=period.fields?.[name];return{field:name,validation:f?.validation??'AUSENTE',value:f?.validation==='VALIDADO'?f.value:null,recordIds:f?.recordIds??[],verificationId:f?.verificationId??null,reason:f?.validation==='VALIDADO'?null:(f?.reason??'Concepto ausente')};});
  const base={code:k.code,unit:k.unit,periodEnd:period.periodEnd,fiscalYear:period.fiscalYear,currency:period.currency??null,publication:period.publication,document:period.document,provider:period.provider,inputs:evidence,warnings:[]};
  const blocked=evidence.filter(e=>e.validation!=='VALIDADO'||typeof e.value!=='number');
  if(blocked.length)return{...base,status:'BLOQUEADO_DEPENDENCIA',value:null,cause:blocked.map(e=>e.field+':'+e.validation).join(', ')};
  const v=Object.fromEntries(evidence.map(e=>[e.field,e.value]));
  const dens=k.dens??(k.den?[k.den]:[]),zero=dens.find(d=>v[d]===0);
  if(zero)return{...base,status:'NO_CALCULABLE',value:null,cause:'DIVISION_POR_CERO:'+zero};
  const value=k.f(v);if(!Number.isFinite(value))return{...base,status:'NO_CALCULABLE',value:null,cause:'RESULTADO_NO_FINITO'};
  for(const d of dens)if(v[d]<0)base.warnings.push('DENOMINADOR_NEGATIVO:'+d);
  return{...base,status:'CERTIFICADO',value,cause:null};
 });
}
// DELTA_NWC = NWC operativo(t) − NWC operativo(t−1), ambos CERTIFICADOS, ejercicios consecutivos y mismo contexto
// (moneda, base consolidada/individual, norma). Positivo = consumo de caja. El primer ejercicio no tiene saldo
// inicial: no se inventa el cierre anterior.
function deltaNwc(prev,period,current){
 const cur=current.find(k=>k.code==='CAPITAL_CIRCULANTE_OPERATIVO'),base={code:'DELTA_NWC',unit:'MONEDA',periodEnd:period.periodEnd,fiscalYear:period.fiscalYear,currency:period.currency??null,publication:period.publication,document:period.document,provider:period.provider,inputs:cur.inputs,warnings:[]};
 if(!prev)return{...base,status:'BLOQUEADO_DEPENDENCIA',value:null,cause:'SALDO_INICIAL_NO_DISPONIBLE'};
 const before=kpisForPeriod(prev).find(k=>k.code==='CAPITAL_CIRCULANTE_OPERATIVO');base.inputs=[...before.inputs.map(e=>({...e,field:'anterior.'+e.field})),...cur.inputs];
 if(period.fiscalYear!==prev.fiscalYear+1)return{...base,status:'BLOQUEADO_DEPENDENCIA',value:null,cause:'EJERCICIOS_NO_CONSECUTIVOS'};
 if([prev,period].some(p=>!p.currency||!p.basis)||prev.currency!==period.currency||prev.basis!==period.basis||(prev.norm??null)!==(period.norm??null))return{...base,status:'BLOQUEADO_DEPENDENCIA',value:null,cause:'CONTEXTO_CAMBIA_ENTRE_CIERRES'};
 if(cur.status!=='CERTIFICADO'||before.status!=='CERTIFICADO')return{...base,status:'BLOQUEADO_DEPENDENCIA',value:null,cause:[before.status!=='CERTIFICADO'?'anterior:'+before.cause:null,cur.status!=='CERTIFICADO'?cur.cause:null].filter(Boolean).join(', ')};
 return{...base,status:'CERTIFICADO',value:cur.value-before.value,cause:null};
}
const DEFINITIONS=[...KPIS.map(({code,unit,inputs,method})=>({code,unit,inputs,method:method??null})),{code:'DELTA_NWC',unit:'MONEDA',inputs:['CAPITAL_CIRCULANTE_OPERATIVO(t)','CAPITAL_CIRCULANTE_OPERATIVO(t-1)'],method:null}];
const kpisForSnapshot=snapshot=>({company:snapshot.company,asOf:snapshot.asOf,inputHash:snapshot.inputHash,definitions:DEFINITIONS,periods:snapshot.periods.map((p,i)=>{const kpis=kpisForPeriod(p);return{periodEnd:p.periodEnd,kpis:[...kpis,deltaNwc(snapshot.periods[i-1],p,kpis)]};})});
module.exports={KPIS,DEFINITIONS,kpisForPeriod,kpisForSnapshot,deltaNwc};
