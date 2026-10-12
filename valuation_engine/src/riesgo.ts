import riskPolicy from '../config/risk_policy_v15.json';
import { ESCENARIOS, FACTORES, type Ajustes, type Evidencia, type ModeloInput } from './tipos';
import { requireNumber } from './wacc';

function evidence(v:unknown,k:string):Evidencia{
  const x=v as Evidencia;
  if(!x||typeof x.source!=='string'||!x.source.trim()||typeof x.reference_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.reference_date)) throw new Error(`${k}: fuente y fecha requeridas`);
  requireNumber(x.value,k);
  return x;
}
function smallPremium(marketcap:number,policy:any):number {
  for(const x of policy.size_buckets){if(marketcap<x.below)return x.premium;}return 0;
}
function volumePremium(volume:number,policy:any):number {
  for(const x of policy.illiquidity_buckets){if(volume<x.below)return x.premium;}return 0;
}
function customerPremium(pct:number,policy:any):number {
  for(const x of policy.concentration_buckets){if(pct>x.above)return x.premium;}return 0;
}
/** No approved policy is invented. Automatic rule outputs always DRAFT/REVIEW. */
export function construirPrimas(data:ModeloInput):{ajustes:Ajustes;method:'MANUAL_APPROVED'|'DRAFT_POLICY'|'SIMULATION_ONLY'|'SYSTEM_DEFAULT_ZERO';warnings:string[]} {
  if(data.wacc_adjustments){
    const a=data.wacc_adjustments;
    for(const scenario of ESCENARIOS) for(const f of FACTORES){
      const e=evidence(a[scenario]?.[f],`${scenario}/${f}`);
      requireNumber(e.value,`${scenario}/${f}`,-0.10,0.10);
    }
    if(data.premium_methodology==='SYSTEM_DEFAULT_ZERO') {
      if(data.risk_inputs) throw new Error('SYSTEM_DEFAULT_ZERO no puede sustituir risk_inputs existentes');
      for(const scenario of ESCENARIOS) for(const f of FACTORES) {
        if(a[scenario][f].value!==0 || a[scenario][f].source!=='SYSTEM_DEFAULT_ZERO_V1') throw new Error('Política cero requiere ceros y fuente SYSTEM_DEFAULT_ZERO_V1');
      }
      return {ajustes:a,method:'SYSTEM_DEFAULT_ZERO',warnings:['HIPOTESIS DEL SISTEMA: primas adicionales cero, sin estimación auditada de estos riesgos. Revisión obligatoria.']};
    }
    if(data.premium_methodology!=='MANUAL_APPROVED' && data.premium_methodology!=='SIMULATION_ONLY') throw new Error('Primas manuales: declarar MANUAL_APPROVED o SIMULATION_ONLY con fuentes identificadas');
    return data.premium_methodology==='SIMULATION_ONLY' ? {ajustes:a,method:'SIMULATION_ONLY',warnings:['SIMULACION NO APROBADA: ajustes hipoteticos, resultados sujetos a revision.']} : {ajustes:a,method:'MANUAL_APPROVED',warnings:['Primas introducidas/validadas manualmente; se mantiene revision humana de la valoracion.']};
  }
  const r=data.risk_inputs;
  const policy=data.risk_policy_snapshot??riskPolicy;
  if(!r) throw new Error('Faltan risk_inputs y wacc_adjustments: no se asignan primas sin datos.');
  const mc=evidence(r.market_cap_usd,'market_cap_usd');
  const vol=evidence(r.median_daily_dollar_volume_90d,'median_daily_dollar_volume_90d');
  const con=evidence(r.largest_customer_revenue_share,'largest_customer_revenue_share');
  requireNumber(mc.value,'market_cap_usd',0);requireNumber(vol.value,'volumen',0);requireNumber(con.value,'concentracion',0,1);
  const bases={prima_iliquidez:volumePremium(vol.value,policy),prima_tamano:smallPremium(mc.value,policy),prima_concentracion_clientes:customerPremium(con.value,policy),otros_ajustes_wacc:0};
  const ajuste={} as Ajustes;
  for(const escenario of ESCENARIOS){
    const multip=requireNumber(policy.multipliers[escenario],'multiplicador pol?tica',0,10);
    const total=Object.values(bases).reduce((x,y)=>x+y,0)*multip;
    if(total>Math.min(0.08,requireNumber(policy.max_total_adjustment,'l?mite pol?tica',0,0.08))) throw new Error('Primas superan 8 pp: revisión financiera obligatoria');
    ajuste[escenario]={} as Ajustes[typeof escenario];
    for(const factor of FACTORES){
      const ref=factor==='prima_tamano'?mc:factor==='prima_iliquidez'?vol:factor==='prima_concentracion_clientes'?con:null;
      ajuste[escenario][factor]={value:bases[factor]*multip,
        source:ref?`DRAFT_POLICY v1.5 / ${ref.source}`:'DRAFT_POLICY v1.5 / sin ajuste adicional',
        reference_date:ref?.reference_date ?? data.valuation_date};
    }
  }
  return {ajustes:ajuste,method:'DRAFT_POLICY',warnings:[policy.warning]};
}
