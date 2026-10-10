import { ESCENARIOS, FACTORES, type ModeloInput, type WaccEscenario, type Ajustes } from './tipos';
export function requireNumber(x:unknown,field:string,min=-Infinity,max=Infinity):number {
  if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max) throw new Error(`${field}: número finito esperado en [${min},${max}]`);
  return x;
}
export function pctMysql(n:number|string,key:string):number {
  const v=Number(n); requireNumber(v,key,0,100);return v/100;
}
export function calcularWacc(i:ModeloInput,ajustes:Ajustes):WaccEscenario[] {
  const rf=requireNumber(i.risk_free_rate,'risk_free_rate',-0.05,0.30);
  const beta=requireNumber(i.sector_beta,'sector_beta',0.01,5);
  const erp=requireNumber(i.equity_risk_premium,'equity_risk_premium',0,0.30);
  const t=requireNumber(i.tax_rate,'tax_rate',0,1);
  const E=requireNumber(i.price_per_share,'price_per_share',0.0000001)*requireNumber(i.diluted_shares,'diluted_shares',0.0000001);
  const D=requireNumber(i.gross_debt_fy0,'gross_debt_fy0',0);
  const spreads={CONSERVATIVE:requireNumber(i.spread_credito_pesimista,'spread pesimista',0,0.5),BASE:requireNumber(i.credit_spread,'spread base',0,0.5),OPTIMISTIC:requireNumber(i.spread_credito_optimista,'spread optimista',0,0.5)};
  if(!(spreads.CONSERVATIVE>=spreads.BASE&&spreads.BASE>=spreads.OPTIMISTIC)) throw new Error('Spreads: CONSERVATIVE >= BASE >= OPTIMISTIC');
  const ke=rf+beta*erp;
  return ESCENARIOS.map(escenario=>{
    const kd=rf+spreads[escenario];
    if(kd<0) throw new Error('Kd negativo');
    const kdnet=kd*(1-t),eweight=E/(E+D),dweight=D/(E+D);
    const base=ke*eweight+kdnet*dweight;
    const a=ajustes[escenario];let total=0;
    for(const key of FACTORES){
      const x=a?.[key];
      if(!x || !x.source?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(x.reference_date)) throw new Error(`Falta evidencia para ${escenario}.${key}`);
      total+=requireNumber(x.value,`${escenario}.${key}`,-0.10,0.10);
    }
    const final=base+total;
    if(final<=0||final>=0.75) throw new Error(`${escenario}: WACC ajustado imposible`);
    return {escenario,rf,beta,erp,ke,spread_credito:spreads[escenario],kd,kd_neto:kdnet,
      equity_market_value_millions:E,debt_financial_millions:D,peso_patrimonio:eweight,peso_deuda:dweight,
      impuesto:t,wacc_financiero:base,ajustes:a,prima_total:total,wacc_ajustado:final};
  });
}
