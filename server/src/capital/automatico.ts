import {calcularPrimasAutomaticas,primasConAprobados,type MetodoPrecio} from './primas';
import {recalcularCapital,impactoDcf,type AjusteAutorizado,VERSION} from './finanzas';

/** Reproduce primas y descuento desde entradas conservadas. No cambia un run. */
export function simularPrimasAutomaticas(input:any,output:any,diagnostico:any,metodos:MetodoPrecio[],inputHash:string,aprobados:AjusteAutorizado[]=[]){
 if(diagnostico.fecha!==input.valuation_date||String(diagnostico.empresa.id)!==String(input.company_id)||diagnostico.empresa.codigo_iso!==input.market)throw Error('Diagnóstico de otra fecha, empresa o mercado');
 const family=({'13':'BANK','14':'INSURANCE','15':'REIT'} as Record<string,string>)[input.template_code]??'FCFF';
 const scenarios=output.wacc_scenarios.map((w:any)=>{
  const reference=input.cost_of_capital_reference?.[w.escenario];
  const ledger=reference?.status==='RECONCILED'&&reference.ke===w.ke&&reference.kd===w.kd&&reference.date<=input.valuation_date&&reference.evidenceHash?reference.includedPremiums:[];
  const base={ke:w.ke,kd:w.kd,pesoPatrimonio:w.peso_patrimonio,pesoDeuda:w.peso_deuda,impuesto:input.tax_rate,familia:family,primasReferencia:ledger,evidenciaBase:inputHash};
  const proposals=calcularPrimasAutomaticas(diagnostico,metodos,base);
  for(const a of aprobados){const p=proposals.primas.find(p=>p.factor===a.factor);if(!p?.propuesta||p.propuesta.methodologyId!==a.metodo.id||p.propuesta.component!==a.componente||p.propuesta.delta!==a.tasa.valor||a.tasa.unidad!=='FRACCION_ANUAL')throw Error('Aprobación no coincide con cálculo automático vigente');}
  const rates=recalcularCapital(base,aprobados,input.valuation_date,input.market),premiums=primasConAprobados(proposals,aprobados,base,input.valuation_date,input.market);
  const value=output.valuations.find((v:any)=>v.escenario===w.escenario);
  return {escenario:w.escenario,...rates,waccHistorico:w.wacc_ajustado,primasAutomaticas:premiums,
   impacto:impactoDcf(value,{...input,_waccOriginal:w},rates.waccAjustado,rates.keAjustado)};
 });
 return {version:VERSION,uso:'AUTOMATICO_PRIMAS',aplicableProduccion:false,runOriginal:input.valuation_run_id,empresaNombre:input.company_name,fechaValoracion:input.valuation_date,plantilla:input.template_code,
  primasAutomaticas:scenarios.find((s:any)=>s.escenario==='BASE')?.primasAutomaticas??scenarios[0]?.primasAutomaticas,escenarios:scenarios,
  entradaPrimas:{diagnostico,metodos,inputHash,aprobados},advertencia:'Simulación independiente: 0 operativo NO_ESTIMABLE conserva la base financiera. El WACC histórico puede contener ajustes DRAFT excluidos del motor nuevo.'};
}
