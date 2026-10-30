import {extraerAnualSecVerificado,type PresentacionAnualSec} from '../pcv/secAnualVerificado';
import type {InformePcv} from '../pcv/normalizarProveedores';
/** Mapeos de totales, nunca movimientos ni componentes aproximados. */
export const CORRIENTES_SEC={activosCorrientes:['AssetsCurrent','ifrs-full:CurrentAssets'],pasivosCorrientes:['LiabilitiesCurrent','ifrs-full:CurrentLiabilities'],prepagos:['PrepaidExpenseCurrent','PrepaidExpensesCurrent']};
export function extraerCorrientes(facts:any,submission:any,report:InformePcv,cik:string,filing:PresentacionAnualSec,hashes:Record<string,unknown>){
 const original=extraerAnualSecVerificado(facts,submission,report,cik,filing,hashes);
 const fields:Record<string,any>={};
 for(const [field,tags] of Object.entries(CORRIENTES_SEC)){
  const candidates:any[]=[];
  for(const qualified of tags){const [ns,tag]=qualified.includes(':')?qualified.split(':'):['us-gaap',qualified];const rows=facts?.facts?.[ns]?.[tag]?.units?.USD??[];
   for(const f of rows)if(f.accn===filing.accession&&f.end===report.end&&f.filed===filing.filed&&f.form===filing.form&&!f.start&&typeof f.val==='number'&&Number.isFinite(f.val)&&f.val>=0)candidates.push({tag:qualified,value:f.val,unit:'USD',end:f.end,filed:f.filed,accession:f.accn});
  }
  if(candidates.length&&new Set(candidates.map(c=>c.value)).size===1)fields[field]={valor:candidates[0].value,unidad:'MONEDA',moneda:'USD',fecha:report.end,conocidoDesde:filing.filed,validado:true,fuente:{identificador:`SEC_EDGAR:${filing.accession}:${candidates.map(c=>c.tag).join('|')}`,url:`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession.replaceAll('-','')}/`},evidencia:candidates};
 }
 return {context:original.context,fields,publication:filing.filed,periodEnd:report.end,hashes,policy:'SEC_CURRENT_TOTALS_EXACT_FILING_V2'};
}
