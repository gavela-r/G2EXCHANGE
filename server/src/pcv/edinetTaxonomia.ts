import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import {normalizarEdinetZip,numeroReportado,type InformePcv,type DatoPcv} from './normalizarProveedores';

// Exact official IFRS tags omitted by the legacy J-GAAP-oriented aliases.
// These are reported facts, never calculated subtotals or company extensions.
const fields:{codigo:string;kind:'instant'|'duration';tags:string[];outflow?:boolean;perShare?:boolean}[]=[
 {codigo:'INGRESOS',kind:'duration',tags:['jpigp_cor:RevenueIFRS']},
 {codigo:'BENEFICIO_BRUTO',kind:'duration',tags:['jpigp_cor:GrossProfitIFRS']},
 {codigo:'EBIT',kind:'duration',tags:['jpigp_cor:OperatingProfitLossIFRS','jpigp_cor:OperatingProfitLossFromContinuingOperationsIFRS','jpigp_cor:OperatingProfitIFRS']},
 {codigo:'BENEFICIO_NETO',kind:'duration',tags:['jpigp_cor:ProfitLossIFRS','jpcrp_cor:ProfitLossIFRSSummaryOfBusinessResults']},
 {codigo:'EFECTIVO',kind:'instant',tags:['jpigp_cor:CashAndCashEquivalentsIFRS','jpcrp_cor:CashAndCashEquivalentsIFRSSummaryOfBusinessResults']},
 {codigo:'ACTIVOS_TOTALES',kind:'instant',tags:['jpigp_cor:AssetsIFRS','jpcrp_cor:TotalAssetsIFRSSummaryOfBusinessResults']},
 {codigo:'PASIVOS_TOTALES',kind:'instant',tags:['jpigp_cor:LiabilitiesIFRS']},
 {codigo:'PATRIMONIO_NETO',kind:'instant',tags:['jpigp_cor:EquityIFRS']},
 {codigo:'INVENTARIOS',kind:'instant',tags:['jpigp_cor:InventoriesCAIFRS','jpigp_cor:InventoriesIFRS']},
 {codigo:'CUENTAS_COBRAR',kind:'instant',tags:['jpigp_cor:TradeAndOtherReceivablesCAIFRS','jpigp_cor:TradeReceivablesCAIFRS']},
 {codigo:'CUENTAS_PAGAR',kind:'instant',tags:['jpigp_cor:TradeAndOtherPayablesCLIFRS','jpigp_cor:TradePayablesCLIFRS']},
 {codigo:'CAPEX',kind:'duration',outflow:true,tags:['jpigp_cor:PurchaseOfPropertyPlantAndEquipmentInvCFIFRS']},
 {codigo:'DIVIDENDOS_PAGADOS',kind:'duration',outflow:true,tags:['jpigp_cor:CashDividendsPaidFinCFIFRS']},
 {codigo:'EPS_DILUIDO',kind:'duration',perShare:true,tags:['jpcrp_cor:DilutedEarningsLossPerShareIFRSSummaryOfBusinessResults','jpcrp_cor:DilutedEarningsLossPerShareUSGAAPSummaryOfBusinessResults','jpigp_cor:DilutedEarningsLossPerShareIFRS']}
];
export function normalizarTaxonomiaEdinet(bytes:Buffer,report:InformePcv):DatoPcv[]{
 if(report.country!=='JP')throw Error('TAXONOMIA_JP_PAIS');
 const primary=normalizarEdinetZip(bytes,report),known=new Set(primary.rows.map(r=>r.codigo));
 const entries=new AdmZip(bytes).getEntries().filter(e=>/publicdoc\/[^/]+\.xbrl$/i.test(e.entryName));if(entries.length!==1)throw Error('EDINET_XBRL_AMBIGUO');
 const $=cheerio.load(entries[0].getData().toString('utf8'),{xml:true}),nodes=$('*').toArray() as any[],local=(s:string)=>s.split(':').pop()||'',root=nodes.find(n=>local(n.name||'')==='xbrl');
 const official=(prefix:string)=>new RegExp('^https?://disclosure\\.edinet-fsa\\.go\\.jp/taxonomy/'+(prefix==='jpigp_cor'?'jpigp':'jpcrp')+'/\\d{4}-\\d{2}-\\d{2}/'+prefix+'$').test(root?.attribs?.['xmlns:'+prefix]||'');
 const contexts=new Map<string,{start:string|null;end:string}>(),units=new Map<string,string>();
 for(const node of nodes){
  if(local(node.name||'')==='unit'){const measures=($(node).find('*').toArray() as any[]).filter(n=>local(n.name||'')==='measure').map(n=>local($(n).text().trim()));units.set(node.attribs.id,measures.join('/'));}
  if(local(node.name||'')!=='context')continue;
  const descendants=$(node).find('*').toArray() as any[],text=(name:string)=>descendants.filter(n=>local(n.name||'')===name).map(n=>$(n).text().trim()),members=descendants.filter(n=>local(n.name||'')==='explicitMember');
  if(descendants.some(n=>local(n.name||'')==='typedMember')||members.some(n=>local(n.attribs.dimension||'')!=='ConsolidatedOrNonConsolidatedAxis'||!['NonConsolidatedMember','ConsolidatedMember'].includes(local($(n).text().trim()))))continue;
  if(primary.identity.consolidated&&members.some(n=>local($(n).text().trim())==='NonConsolidatedMember'))continue;
  if(!primary.identity.consolidated&&members.some(n=>local($(n).text().trim())==='ConsolidatedMember'))continue;
  const identifiers=text('identifier');if(identifiers.length!==1||!new RegExp('^'+primary.identity.edinetCode+'(?:-\\d+)?$').test(identifiers[0]))continue;
  const end=text('endDate')[0]||text('instant')[0],start=text('startDate')[0]||null;if(end!==report.end)continue;
  contexts.set(node.attribs.id,{start,end});
 }
 const result:DatoPcv[]=[];
 for(const field of fields){if(known.has(field.codigo))continue;
  for(const tag of field.tags){if(!official(tag.split(':')[0]))continue;const candidates:DatoPcv[]=[];
   for(const node of nodes){if(node.name!==tag||node.attribs['xsi:nil']==='true')continue;const context=contexts.get(node.attribs.contextRef);if(!context)continue;
    const days=context.start?(Date.parse(context.end)-Date.parse(context.start))/86400000:null;
    if(field.kind==='instant'?context.start!==null:days===null||days<350||days>380)continue;
    const expected=field.perShare?'JPY/shares':'JPY';if(units.get(node.attribs.unitRef)!==expected)continue;
    const reported=numeroReportado($(node).text());if(reported===null)continue;
    candidates.push({codigo:field.codigo,concepto:tag,importe:field.outflow?Math.abs(reported):reported,provider:'EDINET',identifier:report.accession,currency:expected,basis:primary.identity.consolidated?'consolidated':'standalone',evidence:{...primary.identity,start:context.start,end:context.end,context:node.attribs.contextRef,unit:expected,entry:entries[0].entryName,reportedAmount:reported,signPolicy:field.outflow?'EXPLICIT_CASH_OUTFLOW_TO_POSITIVE':'AS_REPORTED',policy:'FSA_EXACT_IFRS_TAGS_V1'}});
   }
   if(candidates.length){if(new Set(candidates.map(r=>r.importe)).size>1)throw Error('TAXONOMIA_JP_FACTS_CONTRADICTORIOS_'+field.codigo);result.push(candidates[0]);break;}
  }
 }
 return result;
}
