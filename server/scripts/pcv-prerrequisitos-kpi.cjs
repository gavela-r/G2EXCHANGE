// Eligibility gate, not a change to the financial formulas. A missing debt
// component is unknown; only an explicitly reported zero is a valid zero.
const DEBT=new Set(['DEUDA_TOTAL','DEUDA_NETA','DEUDA_SOBRE_PATRIMONIO','DEUDA_SOBRE_ACTIVOS']);
const deudaCompleta=values=>Number.isFinite(values.DEUDA_CORTO_PLAZO)&&Number.isFinite(values.DEUDA_LARGO_PLAZO);
function filtrarKpiCalculables(calculated,values){return calculated.filter(k=>!DEBT.has(k.kpi)||deudaCompleta(values));}
function instalarRequisitos(){const mod=require('../dist/insercionDatos/insercionKPIInformeFinanciero'),original=mod.kpiCalcularInforme;if(original.pcvPrerequisitesV2)return;const gated=(id,values)=>filtrarKpiCalculables(original(id,values),values);gated.pcvPrerequisitesV2=true;gated.originalFormula=original;mod.kpiCalcularInforme=gated;}
module.exports={deudaCompleta,filtrarKpiCalculables,instalarRequisitos};
