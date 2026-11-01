import {numeroReportado,type DatoPcv,type InformePcv} from './normalizarProveedores';
import {identidadLegalSec} from './identidadSec';
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
 DEUDA_LARGO_PLAZO:{balance:true,tags:['LongTermDebtAndFinanceLeaseObligationsNoncurrent','LongTermDebtNoncurrent','ifrs-full:NoncurrentBorrowings']},
 FLUJO_CAJA_OPERATIVO:{balance:false,tags:['NetCashProvidedByUsedInOperatingActivities','ifrs-full:CashFlowsFromUsedInOperatingActivities']},
 CAPEX:{balance:false,tags:['PaymentsToAcquirePropertyPlantAndEquipment','ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']},
 DEPRECIACION_AMORTIZACION:{balance:false,tags:['DepreciationDepletionAndAmortization','DepreciationAndAmortization','ifrs-full:DepreciationAndAmortisationExpense']},
 INVENTARIOS:{balance:true,tags:['InventoryNet','Inventories','ifrs-full:Inventories']},
 CUENTAS_COBRAR:{balance:true,tags:['AccountsReceivableNetCurrent','AccountsReceivableNet','TradeAccountsReceivableNetCurrent','TradeAccountsReceivableNet','ifrs-full:CurrentTradeReceivables']},
 CUENTAS_PAGAR:{balance:true,tags:['AccountsPayableCurrent','TradeAccountsPayableCurrent','ifrs-full:CurrentTradePayables']},
 EPS_DILUIDO:{balance:false,tags:['EarningsPerShareDiluted','ifrs-full:DilutedEarningsLossPerShare']}
};
// Componentes de balance que exigen las plantillas sectoriales (arrendamientos, contratos con clientes, deuda por
// instrumento, impuestos y activos fijos). Cada código es UNA partida con significado FASB/IFRS propio; los totales
// (corriente + no corriente, deuda financiera total) se derivan en el adaptador sectorial con trazabilidad, nunca aquí.
// Ninguno alimenta las fórmulas de KPI existentes.
export const TAGS_SEC_COMPONENTES:Record<string,{balance:boolean;tags:string[]}>= {
 ARREND_OPERATIVO_TOTAL:{balance:true,tags:['OperatingLeaseLiability']},
 ARREND_OPERATIVO_CORRIENTE:{balance:true,tags:['OperatingLeaseLiabilityCurrent']},
 ARREND_OPERATIVO_NO_CORRIENTE:{balance:true,tags:['OperatingLeaseLiabilityNoncurrent']},
 ARREND_FINANCIERO_TOTAL:{balance:true,tags:['FinanceLeaseLiability']},
 ARREND_FINANCIERO_CORRIENTE:{balance:true,tags:['FinanceLeaseLiabilityCurrent']},
 ARREND_FINANCIERO_NO_CORRIENTE:{balance:true,tags:['FinanceLeaseLiabilityNoncurrent']},
 ARREND_IFRS_TOTAL:{balance:true,tags:['ifrs-full:LeaseLiabilities']},
 ARREND_IFRS_CORRIENTE:{balance:true,tags:['ifrs-full:CurrentLeaseLiabilities']},
 ARREND_IFRS_NO_CORRIENTE:{balance:true,tags:['ifrs-full:NoncurrentLeaseLiabilities']},
 ACT_CONTRACTUAL_TOTAL:{balance:true,tags:['ContractWithCustomerAssetNet','ifrs-full:ContractAssets']},
 ACT_CONTRACTUAL_CORRIENTE:{balance:true,tags:['ContractWithCustomerAssetNetCurrent','ifrs-full:CurrentContractAssets']},
 ACT_CONTRACTUAL_NO_CORRIENTE:{balance:true,tags:['ContractWithCustomerAssetNetNoncurrent','ifrs-full:NoncurrentContractAssets']},
 PAS_CONTRACTUAL_TOTAL:{balance:true,tags:['ContractWithCustomerLiability','ifrs-full:ContractLiabilities']},
 PAS_CONTRACTUAL_CORRIENTE:{balance:true,tags:['ContractWithCustomerLiabilityCurrent','ifrs-full:CurrentContractLiabilities']},
 PAS_CONTRACTUAL_NO_CORRIENTE:{balance:true,tags:['ContractWithCustomerLiabilityNoncurrent','ifrs-full:NoncurrentContractLiabilities']},
 INGRESO_DIFERIDO_TOTAL:{balance:true,tags:['DeferredRevenue']},
 INGRESO_DIFERIDO_CORRIENTE:{balance:true,tags:['DeferredRevenueCurrent']},
 INGRESO_DIFERIDO_NO_CORRIENTE:{balance:true,tags:['DeferredRevenueNoncurrent']},
 DEUDA_LP_TOTAL:{balance:true,tags:['LongTermDebt']},
 DEUDA_LP_CORRIENTE:{balance:true,tags:['LongTermDebtCurrent']},
 DEUDA_LP_NO_CORRIENTE:{balance:true,tags:['LongTermDebtNoncurrent']},
 EMPRESTITOS_CORTO_PLAZO:{balance:true,tags:['ShortTermBorrowings']},
 PAPEL_COMERCIAL:{balance:true,tags:['CommercialPaper']},
 DEUDA_FINANCIERA_COMBINADA:{balance:true,tags:['DebtLongtermAndShorttermCombinedAmount']},
 PRESTAMOS_IFRS_TOTAL:{balance:true,tags:['ifrs-full:Borrowings']},
 IMPUESTO_CORRIENTE_PAGAR:{balance:true,tags:['AccruedIncomeTaxesCurrent','ifrs-full:CurrentTaxLiabilities']},
 IMPUESTO_CORRIENTE_COBRAR:{balance:true,tags:['IncomeTaxesReceivable','IncomeTaxReceivable','ifrs-full:CurrentTaxAssets']},
 ACTIVO_IMPUESTO_DIFERIDO:{balance:true,tags:['DeferredIncomeTaxAssetsNet','ifrs-full:DeferredTaxAssets']},
 PASIVO_IMPUESTO_DIFERIDO:{balance:true,tags:['DeferredIncomeTaxLiabilitiesNet','ifrs-full:DeferredTaxLiabilities']},
 INMOVILIZADO_MATERIAL_NETO:{balance:true,tags:['PropertyPlantAndEquipmentNet','ifrs-full:PropertyPlantAndEquipment']},
 DERECHO_USO_OPERATIVO:{balance:true,tags:['OperatingLeaseRightOfUseAsset','ifrs-full:RightofuseAssets']},
 INTANGIBLES_NETOS:{balance:true,tags:['IntangibleAssetsNetExcludingGoodwill','ifrs-full:IntangibleAssetsOtherThanGoodwill']},
 FONDO_COMERCIO:{balance:true,tags:['Goodwill','ifrs-full:Goodwill']},
 PARTICIPACIONES_NO_DOMINANTES:{balance:true,tags:['MinorityInterest','ifrs-full:NoncontrollingInterests']},
 VALORES_NEGOCIABLES_CORRIENTES:{balance:true,tags:['MarketableSecuritiesCurrent','AvailableForSaleSecuritiesDebtSecuritiesCurrent','ShortTermInvestments']},
 VALORES_NEGOCIABLES_NO_CORRIENTES:{balance:true,tags:['MarketableSecuritiesNoncurrent','AvailableForSaleSecuritiesDebtSecuritiesNoncurrent','LongTermInvestments']}
};
// Familias para acreditar "no presentado": ninguna etiqueta estándar de la familia en el documento para ese cierre.
// Incluyen variantes que no se extraen (p. ej. pagarés o líneas de crédito) para no declarar ausente una deuda que
// el emisor presenta con otra etiqueta estándar. Las extensiones propias del emisor no figuran en companyfacts.
export const FAMILIAS_SEC_AUSENCIA:Record<string,string[]>={
 FAMILIA_ARRENDAMIENTOS:['OperatingLeaseLiability','OperatingLeaseLiabilityCurrent','OperatingLeaseLiabilityNoncurrent','FinanceLeaseLiability','FinanceLeaseLiabilityCurrent','FinanceLeaseLiabilityNoncurrent','OperatingLeaseLiabilityCurrentAndNoncurrent','CapitalLeaseObligations','CapitalLeaseObligationsCurrent','CapitalLeaseObligationsNoncurrent','ifrs-full:LeaseLiabilities','ifrs-full:CurrentLeaseLiabilities','ifrs-full:NoncurrentLeaseLiabilities'],
 FAMILIA_ACT_CONTRACTUALES:['ContractWithCustomerAssetNet','ContractWithCustomerAssetNetCurrent','ContractWithCustomerAssetNetNoncurrent','ContractWithCustomerAssetGross','ContractWithCustomerAssetGrossCurrent','ifrs-full:ContractAssets','ifrs-full:CurrentContractAssets','ifrs-full:NoncurrentContractAssets'],
 FAMILIA_PAS_CONTRACTUALES:['ContractWithCustomerLiability','ContractWithCustomerLiabilityCurrent','ContractWithCustomerLiabilityNoncurrent','DeferredRevenue','DeferredRevenueCurrent','DeferredRevenueNoncurrent','DeferredRevenueAndCredits','DeferredRevenueAndCreditsCurrent','ifrs-full:ContractLiabilities','ifrs-full:CurrentContractLiabilities','ifrs-full:NoncurrentContractLiabilities','ifrs-full:DeferredIncome'],
 FAMILIA_DEUDA_CORTO_PLAZO_OTRA:['ShortTermBorrowings','CommercialPaper','LinesOfCreditCurrent','NotesPayableCurrent','ConvertibleNotesPayableCurrent','ShortTermBankLoansAndNotesPayable','BankOverdrafts','OtherShortTermBorrowings','LoansPayableCurrent','NotesPayableRelatedPartiesClassifiedCurrent','DebtCurrent'],
 FAMILIA_DEUDA_FINANCIERA:['DebtCurrent','LongTermDebt','LongTermDebtCurrent','LongTermDebtNoncurrent','ShortTermBorrowings','CommercialPaper','LinesOfCreditCurrent','LongTermLineOfCredit','NotesPayableCurrent','NotesPayable','LongTermNotesPayable','ConvertibleNotesPayable','ConvertibleNotesPayableCurrent','ConvertibleDebtNoncurrent','ConvertibleLongTermNotesPayable','SeniorNotes','SecuredDebt','UnsecuredDebt','OtherLongTermDebt','OtherLongTermDebtNoncurrent','LoansPayable','LoansPayableCurrent','LongTermLoansPayable','DebtLongtermAndShorttermCombinedAmount','LongTermDebtAndCapitalLeaseObligations','LongTermDebtAndCapitalLeaseObligationsCurrent','ShortTermBankLoansAndNotesPayable','BankOverdrafts','NotesPayableRelatedPartiesClassifiedCurrent','NotesPayableRelatedPartiesNoncurrent','ifrs-full:Borrowings','ifrs-full:CurrentBorrowings','ifrs-full:NoncurrentBorrowings','ifrs-full:ShorttermBorrowings','ifrs-full:LongtermBorrowings'],
 FAMILIA_INVENTARIOS:['InventoryNet','Inventories','InventoryGross','InventoryFinishedGoods','InventoryRawMaterials','InventoryWorkInProcess','InventoryNoncurrent','RetailRelatedInventoryMerchandise','InventoryFinishedGoodsNetOfReserves','ifrs-full:Inventories','ifrs-full:CurrentInventories'],
 FAMILIA_IMPUESTO_CORRIENTE_PAGAR:['AccruedIncomeTaxesCurrent','AccruedIncomeTaxes','TaxesPayableCurrent','IncomeTaxesPayable','ifrs-full:CurrentTaxLiabilities'],
 FAMILIA_IMPUESTO_CORRIENTE_COBRAR:['IncomeTaxesReceivable','IncomeTaxReceivable','IncomeTaxesReceivableCurrent','PrepaidTaxes','ifrs-full:CurrentTaxAssets'],
 FAMILIA_ACTIVO_IMPUESTO_DIFERIDO:['DeferredIncomeTaxAssetsNet','DeferredTaxAssetsNet','DeferredTaxAssetsNetNoncurrent','DeferredTaxAssetsNetCurrent','ifrs-full:DeferredTaxAssets'],
 FAMILIA_PASIVO_IMPUESTO_DIFERIDO:['DeferredIncomeTaxLiabilitiesNet','DeferredTaxLiabilitiesNoncurrent','DeferredTaxLiabilitiesNet','DeferredTaxLiabilitiesCurrent','ifrs-full:DeferredTaxLiabilities'],
 FAMILIA_INTANGIBLES:['IntangibleAssetsNetExcludingGoodwill','FiniteLivedIntangibleAssetsNet','IndefiniteLivedIntangibleAssetsExcludingGoodwill','IntangibleAssetsNetIncludingGoodwill','ifrs-full:IntangibleAssetsOtherThanGoodwill','ifrs-full:IntangibleAssetsAndGoodwill'],
 FAMILIA_FONDO_COMERCIO:['Goodwill','IntangibleAssetsNetIncludingGoodwill','ifrs-full:Goodwill','ifrs-full:IntangibleAssetsAndGoodwill'],
 FAMILIA_DERECHO_USO:['OperatingLeaseRightOfUseAsset','FinanceLeaseRightOfUseAsset','OperatingAndFinanceLeaseRightOfUseAsset','ifrs-full:RightofuseAssets'],
 FAMILIA_PARTICIPACIONES_NO_DOMINANTES:['MinorityInterest','ifrs-full:NoncontrollingInterests'],
 FAMILIA_VALORES_NEGOCIABLES:['MarketableSecuritiesCurrent','MarketableSecuritiesNoncurrent','MarketableSecurities','AvailableForSaleSecuritiesDebtSecuritiesCurrent','AvailableForSaleSecuritiesDebtSecuritiesNoncurrent','AvailableForSaleSecuritiesDebtSecurities','ShortTermInvestments','OtherShortTermInvestments','LongTermInvestments','HeldToMaturitySecurities','HeldToMaturitySecuritiesCurrent','EquitySecuritiesFvNi','CashCashEquivalentsAndShortTermInvestments','ifrs-full:CurrentInvestments','ifrs-full:NoncurrentInvestments']
};
// Ausencia acreditada sólo en el documento original del cierre (no en comparativos: las notas suelen omitir el año
// anterior) y sólo si el propio documento contiene el balance (activo total) de ese cierre.
export function ausenciasSec(body:any,i:InformePcv,filing:PresentacionAnualSec,familias:Record<string,string[]>=FAMILIAS_SEC_AUSENCIA){
 if(i.end!==filing.end)return {aplicable:false,ausentes:[] as string[],motivo:"COMPARATIVO"};
 const enDocumento=(tag:string)=>rawFacts(body,tag).some(({fact:f})=>f.accn===filing.accession&&f.form===filing.form&&f.filed===filing.filed&&f.end===i.end&&!f.start&&numeroReportado(f.val)!==null);
 if(!enDocumento("Assets")&&!enDocumento("ifrs-full:Assets"))return {aplicable:false,ausentes:[] as string[],motivo:"BALANCE_NO_PRESENTE_EN_DOCUMENTO"};
 return {aplicable:true,ausentes:Object.entries(familias).filter(([,tags])=>!tags.some(enDocumento)).map(([code])=>code),motivo:null};
}
function rawFacts(body:any,tag:string):{unit:string;fact:any}[]{const p=tag.indexOf(':'),ns=p<0?'us-gaap':tag.slice(0,p),local=p<0?tag:tag.slice(p+1),units=body?.facts?.[ns]?.[local]?.units;return units?Object.entries(units).flatMap(([unit,rows])=>Array.isArray(rows)?rows.map(fact=>({unit,fact})):[]):[];}
export function cierresComparativosSec(body:any,filing:PresentacionAnualSec):string[]{
 const ends=new Set<string>();for(const def of Object.values(TAGS_SEC_SEGUROS).filter(d=>!d.balance))for(const tag of def.tags)for(const {fact:f}of rawFacts(body,tag)){
  const days=(Date.parse(f.end)-Date.parse(f.start))/86400000;if(f.accn===filing.accession&&f.form===filing.form&&f.filed===filing.filed&&date(f.end)&&date(f.start)&&days>=350&&days<=380&&f.end<=filing.end&&Number(f.end.slice(0,4))>=2022&&Number(f.end.slice(0,4))<=2025)ends.add(f.end);
 }return [...ends].sort().reverse();
}
export function extraerAnualSecVerificado(body:any,submission:any,i:InformePcv,cik:string,filing:PresentacionAnualSec,hashes:Record<string,unknown>,preferredTags:Record<string,string[]>={},definiciones:Record<string,{balance:boolean;tags:string[]}>=TAGS_SEC_SEGUROS){
 if(!identidadLegalSec({...i,filed:filing.filed},cik,body,submission)||!formularioAnualSec(filing.form)||i.end>filing.end||!date(i.end)||!date(filing.end))throw Error('SEC_IDENTIDAD_DOCUMENTO_NO_VERIFICADOS');
 const valid=(f:any)=>f.accn===filing.accession&&f.form===filing.form&&f.filed===filing.filed&&f.end===i.end&&numeroReportado(f.val)!==null;
 const starts=new Map<string,number>(),currencies=new Set<string>();
 for(const [code,def]of Object.entries(TAGS_SEC_SEGUROS))for(const tag of def.tags)for(const {unit,fact:f}of rawFacts(body,tag))if(valid(f)){
  if(/^[A-Z]{3}$/.test(unit))currencies.add(unit);
  const days=(Date.parse(f.end)-Date.parse(f.start))/86400000;if(!def.balance&&/^[A-Z]{3}$/.test(unit)&&date(f.start)&&days>=350&&days<=380){const k=unit+'|'+f.start;starts.set(k,(starts.get(k)||0)+(['INGRESOS','FLUJO_CAJA_OPERATIVO','BENEFICIO_NETO'].includes(code)?10:1));}
 }
 // Moneda de presentación: USD si el documento presenta en USD; si no, la ÚNICA moneda ISO de los hechos anuales del
 // documento (emisores extranjeros 20-F/40-F). Varias monedas sin USD → ambiguo, no se extrae nada.
 const monedasAnuales=new Set([...starts.keys()].map(k=>k.split('|')[0])),cur=monedasAnuales.has('USD')?'USD':monedasAnuales.size===1?[...monedasAnuales][0]:null;
 if(!cur&&monedasAnuales.size>1)throw Error('SEC_MONEDA_AMBIGUA_'+[...monedasAnuales].sort().join('_'));
 for(const k of [...starts.keys()])if(!k.startsWith(cur+'|'))starts.delete(k);
 const ranked=[...starts].map(([k,n])=>[k.split('|')[1],n] as [string,number]).sort((a,b)=>b[1]-a[1]);if(!ranked.length)throw Error('SEC_PERIODO_ANUAL_SIN_FACTS_ESTANDAR');
 if(ranked.length>1&&ranked[0][1]===ranked[1][1])throw Error('SEC_INICIO_ANUAL_AMBIGUO');const start=ranked[0][0],rows:DatoPcv[]=[],pending:{code:string;reason:string}[]=[];
 for(const [code,def]of Object.entries(definiciones)){const unit=code==='ACCIONES_EN_CIRCULACION'?'shares':code==='EPS_DILUIDO'?cur+'/shares':cur!,safePreferred=(preferredTags[code]||[]).map(t=>t.startsWith('us-gaap:')?t.slice(8):t).filter(t=>def.tags.includes(t)),tags=[...new Set([...safePreferred,...def.tags])];let found=false;
  for(const tag of tags){const facts=rawFacts(body,tag).filter(x=>x.unit===unit&&valid(x.fact)&&(def.balance?!x.fact.start:x.fact.start===start));if(!facts.length)continue;
   if(new Set(facts.map(x=>Number(x.fact.val))).size>1){pending.push({code,reason:'SEC_FACTS_CONTRADICTORIOS_MISMO_CONTEXTO'});found=true;break;}
   const f=facts[0].fact,reportedAmount=Number(f.val),amount=['CAPEX','DIVIDENDOS_PAGADOS'].includes(code)?Math.abs(reportedAmount):reportedAmount;
   rows.push({codigo:code,concepto:tag,importe:amount,provider:'SEC_EDGAR',identifier:i.accession,currency:unit,basis:'consolidated',evidence:{cik,tag,unit,start:def.balance?null:start,end:i.end,filed:filing.filed,accession:filing.accession,filingEnd:filing.end,comparative:i.end!==filing.end,reportedAmount,identityPolicy:'OFFICIAL_LEGAL_NAME_CIK_ANNUAL_INDEX_V1',...hashes,indexHash:filing.indexHash}});found=true;break;
  }if(!found)pending.push({code,reason:'SIN_TAG_TOTAL_ESTANDAR_CONTEXTO_EXACTO_'+cur});
 }
 return {rows,start,currencies:[...currencies],pending,context:{currency:cur!,basis:'consolidated' as const,start,identity:{cik,...hashes,indexHash:filing.indexHash,sourceAccession:filing.accession}}};
}
