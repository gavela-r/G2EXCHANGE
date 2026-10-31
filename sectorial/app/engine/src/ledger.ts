import{Expr,add,sub,mul,iff,ge,div}from'./grafo';
import type{Emisor}from'./activos';
export interface LineaBalance {id:string;label:string;side:'ASSET'|'LIABILITY';flow:'OPERATING'|'INVESTING'|'FINANCING';incomeFlow:'OPERATING'|'INVESTING'|'FINANCING';pnl:'OPERATING'|'FINANCE';valuationRole:'OPERATING'|'NON_OPERATING'|'FINANCING';opening:number|null;source:string;referenceDate:string;}
interface LedgerEmitter extends Emisor {driver(key:string,label?:string,unit?:string):Expr[];}
export interface Ledger {assets:Expr[];liabilities:Expr[];operatingProfit:Expr[];financialProfit:Expr[];oci:Expr[];cfoAdjustment:Expr[];cfi:Expr[];cff:Expr[];fcffAdjustment:Expr[];noncashRecognitionBalance:Expr[];}
export function crearLedger(e:LedgerEmitter,lines:LineaBalance[],years:Expr[]):Ledger{
 const keys:(keyof Ledger)[]=['assets','liabilities','operatingProfit','financialProfit','oci','cfoAdjustment','cfi','cff','fcffAdjustment','noncashRecognitionBalance'];
 const totals=Object.fromEntries(keys.map(k=>[k,years.map(()=>[] as Expr[])])) as Record<keyof Ledger,Expr[][]>;
 if(new Set(lines.map(l=>l.id)).size!==lines.length)throw Error('Líneas contables duplicadas');
 for(const line of lines){
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(line.id)||!line.source||!line.referenceDate||!['ASSET','LIABILITY'].includes(line.side)||!['OPERATING','INVESTING','FINANCING'].includes(line.flow)||!['OPERATING','INVESTING','FINANCING'].includes(line.incomeFlow)||!['OPERATING','FINANCE'].includes(line.pnl)||!['OPERATING','NON_OPERATING','FINANCING'].includes(line.valuationRole))throw Error('Línea contable sin semántica financiera explícita');
  const key='ledger.'+line.id,opening=e.constante(key+'.opening','Apertura '+line.label,line.opening),stocks=e.driver(key+'.stock','Saldo al cierre '+line.label),noncash=e.driver(key+'.noncashPnl','Resultado no monetario (+ganancia/-pérdida) '+line.label),oci=e.driver(key+'.oci','Variación OCI (+patrimonio) '+line.label),cashIncome=e.driver(key+'.cashIncome','Ingreso/gasto monetario '+line.label);
  const recognition=e.driver(key+'.recognition','Reconocimiento no monetario compensado en otra partida '+line.label);
  const end:Expr[]=[];
  for(let i=0;i<5;i++){
   const node=(suffix:string,label:string,x:Expr)=>e.celda('S_OtrasPartidas',key+'.'+suffix,label+' '+line.label,i,x);
   end[i]=node('closing','Saldo contable',iff(ge(stocks[i],0),stocks[i],div(1,0)));const delta=sub(end[i],i?end[i-1]:opening),pnl=node('profit','Resultado del período',add(noncash[i],cashIncome[i]));
   // This is the account rollforward, not a balancing residual in total cash.
   // Asset: Δstock = net investment + noncash profit + OCI.
   // Liability: Δstock = net financing - noncash profit - OCI.
   const cash=node('movement','Flujo explicado por movimientos de la partida',add(mul(line.side==='ASSET'?-1:1,delta),noncash[i],oci[i],mul(line.side==='ASSET'?1:-1,recognition[i])));
   const cashAt=(flow:LineaBalance['flow'])=>add(line.flow===flow?cash:0,line.incomeFlow===flow?cashIncome[i]:0);
   const adjustment=node('cfoAdjustment','Conversión del resultado en flujo operativo',sub(cashAt('OPERATING'),pnl));
   totals[line.side==='ASSET'?'assets':'liabilities'][i].push(end[i]);totals[line.pnl==='OPERATING'?'operatingProfit':'financialProfit'][i].push(pnl);totals.oci[i].push(oci[i]);totals.cfoAdjustment[i].push(adjustment);totals.cfi[i].push(cashAt('INVESTING'));totals.cff[i].push(cashAt('FINANCING'));
   const owner=node('ownerAdjustment','Conversión a flujo del negocio valorado',sub(line.valuationRole==='OPERATING'?add(cash,cashIncome[i]):0,line.pnl==='OPERATING'?pnl:0));totals.fcffAdjustment[i].push(owner);
   totals.noncashRecognitionBalance[i].push(mul(line.side==='ASSET'?1:-1,recognition[i]));
  }
 }
 return Object.fromEntries(keys.map(k=>[k,e.serie('S_OtrasPartidas','ledger.total.'+k,'Total otras partidas: '+k,years.map((_,i)=>add(...totals[k][i])))])) as unknown as Ledger;
}
