import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import {numeroReportado,type DatoPcv,type InformePcv} from './normalizarProveedores';
const local=(s:string)=>s.split(':').pop()||'';
const BALANCE=new Set(['ACCIONES_EN_CIRCULACION','EFECTIVO','ACTIVOS_TOTALES','PASIVOS_TOTALES','PATRIMONIO_NETO','DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO','INVENTARIOS','CUENTAS_COBRAR','CUENTAS_PAGAR']);
// Reported aggregates. Cash paid is distinct from a dividend declaration;
// issued shares are distinct from outstanding shares; components are not totals.
export const TAGS_EDINET_SEGUROS:Record<string,string[]>={
 INGRESOS:['NetSalesSummaryOfBusinessResults','RevenueIFRSSummaryOfBusinessResults','RevenuesUSGAAPSummaryOfBusinessResults','OperatingRevenue1SummaryOfBusinessResults','OperatingRevenue2SummaryOfBusinessResults','NetSales','Revenue','Revenues','RevenueIFRS'],
 BENEFICIO_BRUTO:['GrossProfit','GrossProfitLoss','GrossProfitIFRS'],
 EBIT:['OperatingIncome','OperatingIncomeLoss','OperatingProfitLossIFRS','OperatingProfitIFRS','OperatingIncomeLossUSGAAPSummaryOfBusinessResults','OperatingProfitLoss'],
 BENEFICIO_NETO:['ProfitLoss','ProfitAttributableToOwnersOfParent','NetIncome','NetIncomeLoss','ProfitLossIFRS','ProfitLossIFRSSummaryOfBusinessResults'],
 BENEFICIO_ANTES_IMPUESTOS:['IncomeBeforeIncomeTaxes','ProfitLossBeforeTaxIFRSSummaryOfBusinessResults','ProfitLossBeforeTaxJMISSummaryOfBusinessResults','ProfitLossBeforeTaxUSGAAPSummaryOfBusinessResults','ProfitLossBeforeTaxIFRS'],
 IMPUESTO_BENEFICIOS:['IncomeTaxes','IncomeTaxExpense','IncomeTaxExpenseIFRS'],
 DIVIDENDOS_PAGADOS:['CashDividendsPaidFinCF','DividendsPaidClassifiedAsFinancingActivities','DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities','DividendsPaid','CashDividendsPaidFinCFIFRS'],
 ACCIONES_EN_CIRCULACION:['NumberOfSharesOutstanding'],
 GASTO_INTERESES:['InterestExpensesNOE','InterestExpenses','InterestExpense'],
 EFECTIVO:['CashAndCashEquivalents','CashAndCashEquivalentsSummaryOfBusinessResults','CashAndCashEquivalentsIFRS','CashAndCashEquivalentsIFRSSummaryOfBusinessResults'],
 ACTIVOS_TOTALES:['Assets','TotalAssets','TotalAssetsSummaryOfBusinessResults','AssetsIFRS','TotalAssetsIFRSSummaryOfBusinessResults'],
 PASIVOS_TOTALES:['Liabilities','TotalLiabilities','LiabilitiesIFRS'],
 PATRIMONIO_NETO:['NetAssets','Equity','EquityIFRS','NetAssetsSummaryOfBusinessResults'],
 DEUDA_CORTO_PLAZO:['InterestBearingLiabilitiesCLIFRS','BorrowingsCLIFRS','BorrowingsCurrent','CurrentBorrowings'],
 DEUDA_LARGO_PLAZO:['InterestBearingLiabilitiesNCLIFRS','BorrowingsNCLIFRS','BorrowingsNoncurrent','NonCurrentBorrowings','LongTermDebtNCLIFRS'],
 FLUJO_CAJA_OPERATIVO:['NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults','CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults','CashFlowsFromUsedInOperatingActivitiesJMISSummaryOfBusinessResults','CashFlowsFromUsedInOperatingActivitiesUSGAAPSummaryOfBusinessResults','NetCashProvidedByUsedInOperatingActivities','CashFlowsFromUsedInOperatingActivitiesIFRS','CashFlowsFromUsedInOperatingActivitiesJMIS','CashFlowsFromUsedInOperatingActivitiesUSGAAP','CashFlowsFromUsedInOperatingActivities'],
 CAPEX:['PurchaseOfPropertyPlantAndEquipmentInvCF','PurchaseOfPropertyPlantAndEquipment','PaymentsForPurchaseOfPropertyPlantAndEquipment','PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssetsInvCF','PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssets','PurchaseOfPropertyPlantAndEquipmentInvCFIFRS'],
 DEPRECIACION_AMORTIZACION:['DepreciationAndAmortization','DepreciationAndAmortizationOpeCF','DepreciationAndAmortizationOpeCFIFRS','DepreciationAndOtherAmortizationOpeCF','DepreciationAndAmortisation','DepreciationAndAmortisationExpense','DepreciationDepletionAndAmortization'],
 INVENTARIOS:['Inventories','Inventory','InventoriesCurrent','CurrentInventories','InventoriesCAIFRS','InventoriesIFRS'],
 CUENTAS_COBRAR:['NotesAndAccountsReceivableTradeNet','NotesAndAccountsReceivableTrade','AccountsReceivableTradeNet','AccountsReceivableTrade','TradeReceivables','TradeReceivablesCAIFRS'],
 CUENTAS_PAGAR:['NotesAndAccountsPayableTrade','NotesAndOperatingAccountsPayableTrade','AccountsPayableTrade','AccountsPayableTradeCurrent','NotesAndAccountsPayableTradeCurrent','TradePayables','TradePayablesCurrent','TradePayablesCLIFRS'],
 EPS_DILUIDO:['DilutedEarningsPerShareSummaryOfBusinessResults','DilutedEarningsPerShare','EarningsPerShareDiluted','DilutedEarningsLossPerShare','DilutedEarningsLossPerShareIFRSSummaryOfBusinessResults','DilutedEarningsLossPerShareUSGAAPSummaryOfBusinessResults','DilutedEarningsLossPerShareIFRS']
};
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function extraerAnualEdinetVerificado(bytes:Buffer,i:InformePcv,edinetCode:string,options:{documentEnd?:string;documentPublished?:string;expectedStart?:string;preferredTags?:Record<string,string[]>}={}){
 if(i.country!=='JP'||!/^E\d{5}$/.test(edinetCode))throw Error('EDINET_PAIS_IDENTIDAD');
 const entries=new AdmZip(bytes).getEntries().filter(e=>/publicdoc\/[^/]+\.xbrl$/i.test(e.entryName));if(entries.length!==1||entries[0].header.size>128*1024**2)throw Error('EDINET_XBRL_AMBIGUO_O_EXCESIVO');
 const published=entries[0].entryName.match(/_(\d{4}-\d{2}-\d{2})\.xbrl$/)?.[1]||options.documentPublished||null;
 if(published&&(!date(published)||published>i.filed||options.documentPublished&&published!==options.documentPublished))throw Error('EDINET_FECHA_DOCUMENTO_CONTRADICTORIA');
 const $=cheerio.load(entries[0].getData().toString('utf8'),{xml:true}),nodes=$('*').toArray() as any[],root=nodes.find(n=>local(n.name||'')==='xbrl');
 const official=(name:string,kinds:string[])=>{const p=name.split(':')[0],uri=root?.attribs?.['xmlns:'+p]||'';return kinds.some(kind=>new RegExp('^https?://disclosure\\.edinet-fsa\\.go\\.jp/taxonomy/'+kind+'/\\d{4}-\\d{2}-\\d{2}/'+kind+'_cor$').test(uri));};
 const single=(tag:string)=>{const values=[...new Set(nodes.filter(n=>local(n.name||'')===tag&&official(n.name,['jpdei'])).map(n=>$(n).text().trim()))];if(values.length!==1)throw Error('EDINET_DEI_NO_UNIVOCO_'+tag);return values[0];};
 const docEnd=single('CurrentFiscalYearEndDateDEI'),docStart=single('CurrentFiscalYearStartDateDEI'),securityCode=single('SecurityCodeDEI'),actualCode=single('EDINETCodeDEI'),consolidated=single('WhetherConsolidatedFinancialStatementsArePreparedDEI');
 if(actualCode!==edinetCode||!i.tickers.some(t=>t===securityCode||t+'0'===securityCode)||!date(docEnd)||!date(docStart)||!date(i.end)||i.end>docEnd||docEnd!==(options.documentEnd||i.end)||!['true','false','1','0'].includes(consolidated))throw Error('EDINET_IDENTIDAD_PERIODO_NO_VERIFICADOS');
 const basis=['true','1'].includes(consolidated)?'consolidated':'standalone',contexts=new Map<string,{start:string|null;end:string}>(),units=new Map<string,string>(),availableEnds=new Set<string>();
 for(const node of nodes){
  if(local(node.name||'')==='unit'){const measures=($(node).find('*').toArray() as any[]).filter(n=>local(n.name||'')==='measure').map(n=>$(n).text().trim()),valid=measures.every(m=>m==='iso4217:JPY'||m==='xbrli:shares');if(valid)units.set(node.attribs.id,measures.map(local).join('/'));}
  if(local(node.name||'')!=='context')continue;const ds=$(node).find('*').toArray() as any[],text=(tag:string)=>ds.filter(n=>local(n.name||'')===tag).map(n=>$(n).text().trim()),members=ds.filter(n=>local(n.name||'')==='explicitMember');
  if(ds.some(n=>local(n.name||'')==='typedMember')||members.some(n=>local(n.attribs.dimension||'')!=='ConsolidatedOrNonConsolidatedAxis'||!['NonConsolidatedMember','ConsolidatedMember'].includes(local($(n).text().trim()))))continue;
  if(basis==='consolidated'&&members.some(n=>local($(n).text().trim())==='NonConsolidatedMember'))continue;if(basis==='standalone'&&members.some(n=>local($(n).text().trim())==='ConsolidatedMember'))continue;
  const ids=text('identifier');if(ids.length!==1||!new RegExp('^'+edinetCode+'(?:-\\d+)?$').test(ids[0]))continue;
  const end=text('endDate')[0]||text('instant')[0],start=text('startDate')[0]||null;if(!date(end))continue;if(start&&(!date(start)||(Date.parse(end)-Date.parse(start))/86400000<350||(Date.parse(end)-Date.parse(start))/86400000>380))continue;if(start&&Number(end.slice(0,4))>=2022&&Number(end.slice(0,4))<=2025)availableEnds.add(end);if(end!==i.end)continue;contexts.set(node.attribs.id,{start,end});
 }
 const facts=new Map<string,any[]>();for(const n of nodes)if(n.attribs?.contextRef&&official(n.name,['jppfs','jpcrp','jpigp'])&&contexts.has(n.attribs.contextRef)&&!['true','1'].includes(n.attribs['xsi:nil'])){const key=local(n.name);if(!facts.has(key))facts.set(key,[]);facts.get(key)!.push(n);}
 let start=options.expectedStart||(i.end===docEnd?docStart:null);if(!start){const starts=new Map<string,number>();for(const tags of Object.values(TAGS_EDINET_SEGUROS))for(const tag of tags)for(const n of facts.get(tag)||[]){const s=contexts.get(n.attribs.contextRef)!.start;if(s)starts.set(s,(starts.get(s)||0)+1);}const ranked=[...starts].sort((a,b)=>b[1]-a[1]);if(!ranked.length||ranked.length>1&&ranked[0][1]===ranked[1][1])throw Error('EDINET_COMPARATIVO_SIN_INICIO_UNIVOCO');start=ranked[0][0];}
 if(!date(start)||(Date.parse(i.end)-Date.parse(start))/86400000<350||(Date.parse(i.end)-Date.parse(start))/86400000>380||i.end===docEnd&&start!==docStart)throw Error('EDINET_INICIO_ANUAL_NO_VERIFICADO');
 const rows:DatoPcv[]=[],pending:{code:string;reason:string}[]=[];
 for(const [code,tags]of Object.entries(TAGS_EDINET_SEGUROS)){const preferred=(options.preferredTags?.[code]||[]).map(local).filter(t=>tags.includes(t)),ordered=[...new Set([...preferred,...tags])],unit=code==='ACCIONES_EN_CIRCULACION'?'shares':code==='EPS_DILUIDO'?'JPY/shares':'JPY';let found=false;
  for(const tag of ordered){const candidates=(facts.get(tag)||[]).filter(n=>{const c=contexts.get(n.attribs.contextRef)!;return units.get(n.attribs.unitRef)===unit&&(BALANCE.has(code)?c.start===null:c.start===start)&&numeroReportado($(n).text())!==null;});if(!candidates.length)continue;
   if(new Set(candidates.map(n=>numeroReportado($(n).text()))).size>1){pending.push({code,reason:'EDINET_FACTS_CONTRADICTORIOS_MISMO_CONTEXTO'});found=true;break;}const n=candidates[0],reported=numeroReportado($(n).text())!,amount=['CAPEX','DIVIDENDOS_PAGADOS'].includes(code)?Math.abs(reported):reported,c=contexts.get(n.attribs.contextRef)!;
   rows.push({codigo:code,concepto:n.name,importe:amount,provider:'EDINET',identifier:i.accession,currency:unit,basis,evidence:{edinetCode,securityCode,context:n.attribs.contextRef,start:c.start,end:c.end,documentStart:docStart,documentEnd:docEnd,filed:published,comparative:i.end!==docEnd,entry:entries[0].entryName,reportedAmount:reported,policy:'FSA_OFFICIAL_TOTALS_CONTEXT_V1'}});found=true;break;
  }if(!found)pending.push({code,reason:code==='ACCIONES_EN_CIRCULACION'?'ISSUED_SHARES_NOT_ASSUMED_OUTSTANDING':'SIN_TAG_TOTAL_OFICIAL_CONTEXTO_EXACTO'});
 }
 return {rows,start,published,documentEnd:docEnd,availableEnds:[...availableEnds].sort().reverse(),identity:{edinetCode,securityCode,end:i.end,consolidated:basis==='consolidated'},pending,context:{currency:'JPY' as const,basis,start,identity:{edinetCode,securityCode,documentEnd:docEnd,published}}};
}
