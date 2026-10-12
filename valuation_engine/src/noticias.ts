import type { ModeloInput, Ajustes, NewsEvent } from './tipos';
import {requireNumber} from './wacc';
export interface NoticiasResult {audit:Array<{signal_id:string|number;aplicado:boolean;motivo:string}>;deltas:{growth:number;capex_ratio:number};dilutionMultiplier:number}
/** No news downloaded automatically. Inputs must come from a verified source with approval metadata. */
export function procesarNoticias(data:ModeloInput,ajustes:Ajustes):NoticiasResult {
  const events=data.news_events||[];
  if(events.length>20) throw new Error('Máximo 20 noticias');
  const result:NoticiasResult={audit:[],deltas:{growth:0,capex_ratio:0},dilutionMultiplier:1};
  for(const evt of events){
    const a:{signal_id:string|number;aplicado:boolean;motivo:string}={signal_id:evt.signal_id,aplicado:false,motivo:''};
    result.audit.push(a);
    const fresh=!evt.expiry_date||evt.expiry_date>=data.valuation_date;
    const verifiable=evt.primary_official_source===true||(evt.independent_sources??0)>=2;
    if(!evt.approved||!evt.source_url?.trim()||!fresh||!verifiable||evt.confidence<0.70||evt.materiality<0.50){a.motivo='Sin aprobación, evidencia, relevancia o vigencia suficientes';continue;}
    const delta=requireNumber(evt.proposed_adjustment,'ajuste noticia',-0.5,2);
    if(evt.variable_code==='crecimiento_proyectado'||evt.variable_code==='capex'){
      if(evt.scenario!=='BASE'||evt.unit!=='ratio_points'||Math.abs(delta)>0.015){a.motivo='Delta de crecimiento/CAPEX debe ser BASE, ratio_points y <= 1.5 pp';continue;}
      const key=evt.variable_code==='capex'?'capex_ratio':'growth';result.deltas[key]+=delta;
      if(Math.abs(result.deltas[key])>0.03) throw new Error('Acumulado noticias supera límite 3 pp');
      a.aplicado=true;a.motivo=`Delta aplicado al driver ${key}`;
    }else if(evt.variable_code==='acciones_en_circulacion'){
      if(evt.unit!=='fractional_change'||delta<=-0.5||delta>=2){a.motivo='Dilución requiere fractional_change entre -0.5 y 2';continue;}
      result.dilutionMultiplier*=1+delta;a.aplicado=true;a.motivo='Cambio de acciones aplicado antes de calcular E y valor por acción';
    }else if(evt.variable_code==='prima_riesgo_especifica'){
      const scenario=evt.scenario;
      if(!scenario||!['BASE','CONSERVATIVE','OPTIMISTIC'].includes(scenario)||evt.unit!=='rate'||evt.systematic_unpriced!==true||Math.abs(delta)>0.02){a.motivo='Prima WACC no aprobada por riesgo sistemático no duplicado';continue;}
      const adj=ajustes[scenario].otros_ajustes_wacc;
      if(Math.abs(adj.value+delta)>0.10) throw new Error('Riesgo combinado excesivo');
      adj.value+=delta;adj.source+=` | NOTICIA ${evt.signal_id}: ${evt.source_url}`;
      a.aplicado=true;a.motivo='Ajuste de WACC, revisar doble conteo antes de aprobar';
    }else {a.motivo='Probabilidad quiebra y eventos no modelizados: sin ajuste automático';}
  }
  return result;
}
