import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import {PCV_CONCEPTOS,JP_PCV_CONCEPTOS,pcvCandidatosTag,pcvElegirMejorFact} from '../../insercionDatos/insercionPartidaContable';

export interface InformePcv { id:number; empresa_id:number; nombre_empresa:string; country:'US'|'JP'; end:string; filed:string; accession:string; form:string; tickers:string[]; }
export interface DatoPcv { codigo:string; concepto:string; importe:number; provider:string; identifier:string; currency:string; basis:string; evidence:Record<string,unknown>; }
export interface IdentidadJp { edinetCode:string; securityCode:string; end:string; consolidated:boolean; }
export function numeroReportado(v:unknown):number|null {
 if(v===null||v===undefined||typeof v==='boolean'||v==='')return null;
 if(typeof v==='string'&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.trim()))return null;
 const n=Number(v);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
}
export const nombreNormalizado=(s:string)=>s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
export function identidadUs(i:InformePcv,cik:string,body:any):boolean {
 return Number(body?.cik)===Number(cik)&&nombreNormalizado(i.nombre_empresa)===nombreNormalizado(body?.entityName||body?.name||'');
}
export function identidadHistoricaSec(i:InformePcv,cik:string,submission:any):boolean {
 return Number(submission?.cik)===Number(cik)&&Array.isArray(submission.formerNames)&&submission.formerNames.some((n:any)=>nombreNormalizado(n.name||'')===nombreNormalizado(i.nombre_empresa)&&String(n.from).slice(0,10)<=i.filed&&String(n.to).slice(0,10)>=i.filed);
}
export function normalizarSec(body:any,i:InformePcv,cik:string,submission?:any):DatoPcv[] {
 if(Number(body?.cik)!==Number(cik)||(!identidadUs(i,cik,body)&&!identidadHistoricaSec(i,cik,submission)))throw new Error('SEC_IDENTIDAD_PENDIENTE');
 const report={informe_id:i.id,empresa_id:i.empresa_id,ticker:i.tickers[0],tipo_periodo:'ANUAL',tipo_documento:i.form,fecha_fin_periodo:i.end,fecha_publicacion:i.filed,accession:i.accession};
 const out:DatoPcv[]=[];
 for(const def of PCV_CONCEPTOS){for(const tag of def.tags){const unit=def.codigo==='ACCIONES_EN_CIRCULACION'?'shares':def.codigo==='EPS_DILUIDO'?'USD/shares':'USD';
  const facts=pcvCandidatosTag(body,tag,report).filter(f=>f.unit===unit&&numeroReportado(f.value)!==null);
  const fact=pcvElegirMejorFact(facts,report,def.categoria);if(!fact)continue;
  if(facts.filter(f=>f.end===fact.end&&f.start===fact.start).some(f=>f.value!==fact.value))throw new Error('SEC_FACTS_CONTRADICTORIOS');
  out.push({codigo:def.codigo,concepto:tag,importe:fact.value,provider:'SEC_EDGAR',identifier:i.accession,currency:unit,basis:'consolidated',evidence:{cik,tag,unit,start:fact.start,end:fact.end,filed:fact.filed,accession:fact.accn}});break;
 }}return out;
}
const local=(name:string)=>name.split(':').pop()!;
export function normalizarEdinetZip(bytes:Buffer,i:InformePcv):{identity:IdentidadJp;rows:DatoPcv[]} {
 const entries=new AdmZip(bytes).getEntries().filter(e=>/publicdoc\/[^/]+\.xbrl$/i.test(e.entryName));
 if(entries.length!==1)throw new Error('EDINET_XBRL_AMBIGUO');
 const $=cheerio.load(entries[0].getData().toString('utf8'),{xml:true}),nodes=$('*').toArray();
 const texts=(name:string)=>nodes.filter((n:any)=>local(n.name||'')===name).map(n=>$(n).text().trim());
 const single=(name:string)=>{const a=[...new Set(texts(name))];if(a.length!==1)throw new Error('EDINET_DEI_'+name);return a[0];};
 const identity={edinetCode:single('EDINETCodeDEI'),securityCode:single('SecurityCodeDEI'),end:single('CurrentFiscalYearEndDateDEI'),consolidated:single('WhetherConsolidatedFinancialStatementsArePreparedDEI')==='true'};
 if(identity.end!==i.end||!i.tickers.some(t=>identity.securityCode===t+'0'||identity.securityCode===t))throw new Error('EDINET_IDENTIDAD_PERIODO_PENDIENTE');
 const units=new Map<string,string>(),contexts=new Map<string,{start:string|null;end:string}>();
 for(const n of nodes as any[]){const name=local(n.name||'');if(name==='unit'){const measures=$(n).find('*').toArray().filter((v:any)=>local(v.name||'')==='measure').map(v=>local($(v).text().trim()));units.set(n.attribs.id,measures.join('/'));}
  if(name!=='context')continue;
  const children=$(n).find('*').toArray() as any[];
  const value=(key:string)=>children.filter(v=>local(v.name||'')===key).map(v=>$(v).text().trim());
  const members=value('explicitMember'),typed=children.some(v=>local(v.name||'')==='typedMember');
  if(typed||members.some(m=>!/(^|:)(NonConsolidatedMember|ConsolidatedMember)$/.test(m)))continue;
  if(identity.consolidated&&members.some(m=>m.endsWith('NonConsolidatedMember')))continue;
  if(!identity.consolidated&&members.some(m=>/(^|:)ConsolidatedMember$/.test(m)))continue;
  const end=value('endDate')[0]||value('instant')[0],start=value('startDate')[0]||null;
  if(end!==i.end)continue;
  contexts.set(n.attribs.id,{start,end});
 }
 const rows:DatoPcv[]=[];
 for(const def of JP_PCV_CONCEPTOS){let chosen:DatoPcv|undefined;
  for(const alias of def.aliases){const candidates:DatoPcv[]=[];
   for(const n of nodes as any[]){if(local(n.name||'')!==alias)continue;
    const ctx=contexts.get(n.attribs?.contextRef);if(!ctx||n.attribs['xsi:nil']==='true')continue;
    if(def.categoria==='BALANCE'?ctx.start!==null:!ctx.start||((Date.parse(ctx.end)-Date.parse(ctx.start))/86400000<350)||((Date.parse(ctx.end)-Date.parse(ctx.start))/86400000>380))continue;
    const unit=units.get(n.attribs.unitRef)||'',shares=def.codigo==='ACCIONES_EN_CIRCULACION',expected=shares?'shares':def.codigo==='EPS_DILUIDO'?'JPY/shares':'JPY';
    if(unit!==expected)continue;
    const amount=numeroReportado($(n).text());if(amount===null)continue;
    candidates.push({codigo:def.codigo,concepto:n.name,importe:amount,provider:'EDINET',identifier:i.accession,currency:expected,basis:identity.consolidated?'consolidated':'standalone',evidence:{...identity,unit,context:n.attribs.contextRef,start:ctx.start,end:ctx.end,entry:entries[0].entryName}});
   }
   if(candidates.length){if(new Set(candidates.map(c=>c.importe)).size!==1)break;chosen=candidates[0];break;}
  }if(chosen)rows.push(chosen);
 }return {identity,rows};
}

const FDE:Record<string,Record<string,string>>={
 income_statement:{revenue:'INGRESOS',gross_profit:'BENEFICIO_BRUTO',operating_income:'EBIT',net_income:'BENEFICIO_NETO',interest_expense:'GASTO_INTERESES',income_before_tax:'BENEFICIO_ANTES_IMPUESTOS',income_tax_expense:'IMPUESTO_BENEFICIOS'},
 balance_sheet:{cash_and_equivalents:'EFECTIVO',total_assets:'ACTIVOS_TOTALES',total_liabilities:'PASIVOS_TOTALES',total_stockholders_equity:'PATRIMONIO_NETO',short_term_debt:'DEUDA_CORTO_PLAZO',long_term_debt:'DEUDA_LARGO_PLAZO',inventory:'INVENTARIOS',accounts_receivable:'CUENTAS_COBRAR',accounts_payable:'CUENTAS_PAGAR'},
 cash_flow:{net_cash_operating:'FLUJO_CAJA_OPERATIVO',capital_expenditures:'CAPEX',depreciation_amortization:'DEPRECIACION_AMORTIZACION',dividends_paid:'DIVIDENDOS_PAGADOS'}
};
const AV:Record<string,Record<string,string>>={
 INCOME_STATEMENT:{totalRevenue:'INGRESOS',grossProfit:'BENEFICIO_BRUTO',operatingIncome:'EBIT',netIncome:'BENEFICIO_NETO',interestExpense:'GASTO_INTERESES',incomeBeforeTax:'BENEFICIO_ANTES_IMPUESTOS',incomeTaxExpense:'IMPUESTO_BENEFICIOS'},
 BALANCE_SHEET:{cashAndCashEquivalentsAtCarryingValue:'EFECTIVO',totalAssets:'ACTIVOS_TOTALES',totalLiabilities:'PASIVOS_TOTALES',totalShareholderEquity:'PATRIMONIO_NETO',shortTermDebt:'DEUDA_CORTO_PLAZO',longTermDebtNoncurrent:'DEUDA_LARGO_PLAZO',inventory:'INVENTARIOS',currentNetReceivables:'CUENTAS_COBRAR',currentAccountsPayable:'CUENTAS_PAGAR'},
 CASH_FLOW:{operatingCashflow:'FLUJO_CAJA_OPERATIVO',capitalExpenditures:'CAPEX',depreciationDepletionAndAmortization:'DEPRECIACION_AMORTIZACION',dividendPayout:'DIVIDENDOS_PAGADOS'}
};
export function normalizarFde(body:any,profile:any,i:InformePcv,cik:string,statement:string,submission?:any):DatoPcv[]{
 const p=profile?.data;if(Number(p?.cik)!==Number(cik)||(!identidadUs(i,cik,p)&&!identidadHistoricaSec(i,cik,submission))||Number(body.meta?.cik)!==Number(cik)||body.meta?.period!=='annual'||body.meta?.statement!==statement)throw new Error('FDE_IDENTIDAD_PENDIENTE');
 // The endpoint does not supply currency per row. Require an independently
 // verified USD currency from the same SEC filing (provided by the runner).
 if(!Array.isArray(body.data))throw new Error('FDE_SCHEMA');
 const matches=body.data.filter((r:any)=>r.period_end===i.end&&r.accession===i.accession);if(matches.length!==1)return [];
 const r=matches[0];return mappedRows(FDE[statement]||{},r,'FINDATAENGINE',i,'USD',{cik,statement,period_end:r.period_end,accession:r.accession,as_reported_filed:r.as_reported_filed});
}
export function normalizarAlpha(body:any,i:InformePcv,statement:string):DatoPcv[]{
 if(!i.tickers.includes(body?.symbol)||!Array.isArray(body?.annualReports))throw new Error('ALPHA_SCHEMA_IDENTIDAD');
 const matches=body.annualReports.filter((r:any)=>r.fiscalDateEnding===i.end&&r.reportedCurrency==='USD');if(matches.length!==1)return [];
 return mappedRows(AV[statement]||{},matches[0],'ALPHAVANTAGE',i,'USD',{symbol:body.symbol,statement,end:i.end,currency:'USD',accession_binding:'SEC profile + exact fiscal period; provider does not supply accession'});
}
const EDB:Record<string,string>={revenue:'INGRESOS',gross_profit:'BENEFICIO_BRUTO',operating_income:'EBIT',net_income:'BENEFICIO_NETO',profit_before_tax:'BENEFICIO_ANTES_IMPUESTOS',income_taxes:'IMPUESTO_BENEFICIOS',interest_expenses:'GASTO_INTERESES',cash:'EFECTIVO',total_assets:'ACTIVOS_TOTALES',total_liabilities:'PASIVOS_TOTALES',net_assets:'PATRIMONIO_NETO',ibd_current:'DEUDA_CORTO_PLAZO',ibd_noncurrent:'DEUDA_LARGO_PLAZO',inventories:'INVENTARIOS',trade_receivables:'CUENTAS_COBRAR',trade_payables:'CUENTAS_PAGAR',cf_operating:'FLUJO_CAJA_OPERATIVO',purchase_of_ppe:'CAPEX',depreciation:'DEPRECIACION_AMORTIZACION',cash_dividends_paid:'DIVIDENDOS_PAGADOS'};
export function necesitaStatement(provider:'FINDATAENGINE'|'ALPHAVANTAGE',statement:string,known:Set<string>):boolean {
 return Object.values((provider==='FINDATAENGINE'?FDE:AV)[statement]||{}).some(code=>!known.has(code));
}
export function normalizarEdinetDb(body:any,identity:IdentidadJp,i:InformePcv):DatoPcv[]{
 if(body?.meta?.edinet_code!==identity.edinetCode||body.meta?.period!=='annual'||!Array.isArray(body?.data))throw new Error('EDINETDB_IDENTIDAD');
 const matches=body.data.filter((r:any)=>r.doc_id===i.accession&&Number(r.fiscal_year)===Number(i.end.slice(0,4)));if(matches.length!==1)return [];
 const r=matches[0];if(r.basis!==(identity.consolidated?'consolidated':'standalone')||r.basis_source!=='value_provenance')return [];
 return mappedRows(EDB,r,'EDINET_DB',i,'JPY',{edinetCode:identity.edinetCode,doc_id:r.doc_id,year:r.fiscal_year,basis:r.basis,accounting_standard:r.accounting_standard},r.basis);
}
function mappedRows(mapping:Record<string,string>,row:any,provider:string,i:InformePcv,currency:string,evidence:Record<string,unknown>,basis='consolidated'):DatoPcv[]{
 return Object.entries(mapping).flatMap(([field,codigo])=>{const importe=numeroReportado(row[field]);return importe===null?[]:[{codigo,concepto:provider+':'+field,importe,provider,identifier:i.accession,currency,basis,evidence:{...evidence,field}}];});
}
