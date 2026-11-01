// V2 adds two explicitly verified FASB totals and official same-CIK name continuity.
// Definitions: https://xbrl.fasb.org/us-gaap/2024/elts/us-gaap-doc-2024.xml
import {numeroReportado,type DatoPcv,type InformePcv} from './normalizarProveedores';
import {identidadLegalSec} from './identidadSecV2';
export interface PresentacionAnualSec {accession:string;form:string;end:string;filed:string;primaryDocument:string;indexHash:string}
const date=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export const formularioAnualSec=(s:string)=>/^(10-K|20-F|40-F)(\/A)?$/.test(s);
export function presentacionesAnualesSec(indexes:{data:any;hash:string}[]):PresentacionAnualSec[]{
 const out=new Map<string,PresentacionAnualSec>();
 for(const index of indexes){const f=index.data;if(!Array.isArray(f?.accessionNumber))continue;
  for(let n=0;n<f.accessionNumber.length;n++){const a=f.accessionNumber[n],form=f.form?.[n],end=f.reportDate?.[n],filed=f.filingDate?.[n];if(!/^\d{10}-\d{2}-\d{6}$/.test(a)||!formularioAnualSec(form)||!date(end)||!date(filed)||filed<end)continue;
   const row={accession:a,form,end,filed,primaryDocument:String(f.primaryDocument?.[n]||''),indexHash:index.hash},old=out.get(a);
   if(old&&(old.end!==end||old.filed!==filed||old.form!==form))throw Error('SEC_INDICES_CONTRADICTORIOS');out.set(a,row);
  }
 }return [...out.values()].sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed)||b.accession.localeCompare(a.accession));
}
// Explicit aggregate meanings only. Components (e.g. raw materials, lease
// interest, preferred dividends) never become totals merely as a fallback.
export const TAGS_SEC_SEGUROS:Record<string,{balance:boolean;tags:string[]}>= {
 INGRESOS:{balance:false,tags:['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','ifrs-full:Revenue','ifrs-full:RevenueFromContractsWithCustomers']},
 BENEFICIO_BRUTO:{balance:false,tags:['GrossProfit','ifrs-full:GrossProfit']},
 EBIT:{balance:false,tags:['OperatingIncomeLoss','ifrs-full:ProfitLossFromOperatingActivities']},
 BENEFICIO_NETO:{balance:false,tags:['NetIncomeLoss','ifrs-full:ProfitLossAttributableToOwnersOfParent']},
 BENEFICIO_ANTES_IMPUESTOS:{balance:false,tags:['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest','IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments','IncomeLossFromContinuingOperationsBeforeIncomeTaxes','ifrs-full:ProfitLossBeforeTax']},
 IMPUESTO_BENEFICIOS:{balance:false,tags:['IncomeTaxExpenseBenefit','ifrs-full:IncomeTaxExpense']},
 DIVIDENDOS_PAGADOS:{balance:false,tags:['PaymentsOfDividends','ifrs-full:DividendsPaid']},
 ACCIONES_EN_CIRCULACION:{balance:true,tags:['CommonStockSharesOutstanding','dei:EntityCommonStockSharesOutstanding','ifrs-full:NumberOfSharesOutstanding']},
 GASTO_INTERESES:{balance:false,tags:['InterestExpenseNonOperating','InterestExpense','InterestAndDebtExpense','ifrs-full:InterestExpense']},
 EFECTIVO:{balance:true,tags:['CashAndCashEquivalentsAtCarryingValue','ifrs-full:CashAndCashEquivalents']},
 ACTIVOS_TOTALES:{balance:true,tags:['Assets','ifrs-full:Assets']},
 PASIVOS_TOTALES:{balance:true,tags:['Liabilities','ifrs-full:Liabilities']},
 PATRIMONIO_NETO:{balance:true,tags:['StockholdersEquity','PartnersCapital','MembersEquity','ifrs-full:EquityAttributableToOwnersOfParent']},
 DEUDA_CORTO_PLAZO:{balance:true,tags:['DebtCurrent','ifrs-full:CurrentBorrowings']},
 DEUDA_LARGO_PLAZO:{balance:true,tags:['LongTermDebtAndCapitalLeaseObligations','LongTermDebtAndFinanceLeaseObligationsNoncurrent','LongTermDebtNoncurrent','ifrs-full:NoncurrentBorrowings']},
 FLUJO_CAJA_OPERATIVO:{balance:false,tags:['NetCashProvidedByUsedInOperatingActivities','ifrs-full:CashFlowsFromUsedInOperatingActivities']},
 CAPEX:{balance:false,tags:['PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets','ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']},
 DEPRECIACION_AMORTIZACION:{balance:false,tags:['DepreciationDepletionAndAmortization','DepreciationAndAmortization','ifrs-full:DepreciationAndAmortisationExpense']},
 INVENTARIOS:{balance:true,tags:['InventoryNet','Inventories','ifrs-full:Inventories']},
 CUENTAS_COBRAR:{balance:true,tags:['AccountsReceivableNetCurrent','AccountsReceivableNet','TradeAccountsReceivableNetCurrent','TradeAccountsReceivableNet','ifrs-full:CurrentTradeReceivables']},
 CUENTAS_PAGAR:{balance:true,tags:['AccountsPayableCurrent','TradeAccountsPayableCurrent','ifrs-full:CurrentTradePayables']},
 EPS_DILUIDO:{balance:false,tags:['EarningsPerShareDiluted','ifrs-full:DilutedEarningsLossPerShare']}
};
function rawFacts(body:any,tag:string):{unit:string;fact:any}[]{const p=tag.indexOf(':'),ns=p<0?'us-gaap':tag.slice(0,p),local=p<0?tag:tag.slice(p+1),units=body?.facts?.[ns]?.[local]?.units;return units?Object.entries(units).flatMap(([unit,rows])=>Array.isArray(rows)?rows.map(fact=>({unit,fact})):[]):[];}
export function cierresComparativosSec(body:any,filing:PresentacionAnualSec):string[]{
 const ends=new Set<string>();for(const def of Object.values(TAGS_SEC_SEGUROS).filter(d=>!d.balance))for(const tag of def.tags)for(const {fact:f}of rawFacts(body,tag)){
  const days=(Date.parse(f.end)-Date.parse(f.start))/86400000;if(f.accn===filing.accession&&f.form===filing.form&&f.filed===filing.filed&&date(f.end)&&date(f.start)&&days>=350&&days<=380&&f.end<=filing.end&&Number(f.end.slice(0,4))>=2022&&Number(f.end.slice(0,4))<=2025)ends.add(f.end);
 }return [...ends].sort().reverse();
}
export function extraerAnualSecVerificado(body:any,submission:any,i:InformePcv,cik:string,filing:PresentacionAnualSec,hashes:Record<string,unknown>,preferredTags:Record<string,string[]>={}){
 const identityCriterion=identidadLegalSec({...i,filed:filing.filed},cik,body,submission);if(!identityCriterion||!formularioAnualSec(filing.form)||i.end>filing.end||!date(i.end)||!date(filing.end))throw Error('SEC_IDENTIDAD_DOCUMENTO_NO_VERIFICADOS');
 const valid=(f:any)=>f.accn===filing.accession&&f.form===filing.form&&f.filed===filing.filed&&f.end===i.end&&numeroReportado(f.val)!==null;
 const starts=new Map<string,number>(),currencies=new Set<string>();
 for(const [code,def]of Object.entries(TAGS_SEC_SEGUROS))for(const tag of def.tags)for(const {unit,fact:f}of rawFacts(body,tag))if(valid(f)){
  if(/^[A-Z]{3}$/.test(unit))currencies.add(unit);
  const days=(Date.parse(f.end)-Date.parse(f.start))/86400000;if(!def.balance&&unit==='USD'&&date(f.start)&&days>=350&&days<=380)starts.set(f.start,(starts.get(f.start)||0)+(['INGRESOS','FLUJO_CAJA_OPERATIVO','BENEFICIO_NETO'].includes(code)?10:1));
 }
 const ranked=[...starts].sort((a,b)=>b[1]-a[1]);if(!ranked.length)throw Error(currencies.size&&!currencies.has('USD')?'SEC_MONEDA_NO_SOPORTADA_'+[...currencies].sort().join('_'):'SEC_PERIODO_ANUAL_SIN_FACTS_ESTANDAR');
 if(ranked.length>1&&ranked[0][1]===ranked[1][1])throw Error('SEC_INICIO_ANUAL_AMBIGUO');const start=ranked[0][0],rows:DatoPcv[]=[],pending:{code:string;reason:string}[]=[];
 for(const [code,def]of Object.entries(TAGS_SEC_SEGUROS)){const unit=code==='ACCIONES_EN_CIRCULACION'?'shares':code==='EPS_DILUIDO'?'USD/shares':'USD',safePreferred=(preferredTags[code]||[]).map(t=>t.startsWith('us-gaap:')?t.slice(8):t).filter(t=>def.tags.includes(t)),tags=[...new Set([...safePreferred,...def.tags])];let found=false;
  for(const tag of tags){const facts=rawFacts(body,tag).filter(x=>x.unit===unit&&valid(x.fact)&&(def.balance?!x.fact.start:x.fact.start===start));if(!facts.length)continue;
   if(new Set(facts.map(x=>Number(x.fact.val))).size>1){pending.push({code,reason:'SEC_FACTS_CONTRADICTORIOS_MISMO_CONTEXTO'});found=true;break;}
   const f=facts[0].fact,reportedAmount=Number(f.val),amount=['CAPEX','DIVIDENDOS_PAGADOS'].includes(code)?Math.abs(reportedAmount):reportedAmount;
   rows.push({codigo:code,concepto:tag,importe:amount,provider:'SEC_EDGAR',identifier:i.accession,currency:unit,basis:'consolidated',evidence:{cik,tag,unit,start:def.balance?null:start,end:i.end,filed:filing.filed,accession:filing.accession,filingEnd:filing.end,comparative:i.end!==filing.end,reportedAmount,identityPolicy:'OFFICIAL_CIK_EXPLICIT_LEGAL_NAME_CONTINUITY_V2',identityCriterion,databaseName:i.nombre_empresa,companyFactsName:body.entityName,currentLegalName:submission.name,...hashes,indexHash:filing.indexHash}});found=true;break;
  }if(!found)pending.push({code,reason:'SIN_TAG_TOTAL_ESTANDAR_USD_CONTEXTO_EXACTO'});
 }
 return {rows,start,currencies:[...currencies],pending,context:{currency:'USD' as const,basis:'consolidated' as const,start,identity:{cik,identityCriterion,databaseName:i.nombre_empresa,companyFactsName:body.entityName,currentLegalName:submission.name,...hashes,indexHash:filing.indexHash,sourceAccession:filing.accession}}};
}
