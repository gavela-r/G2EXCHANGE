import{Expr,add,sub,mul,min,max,iff,ge,div}from'./grafo';
import type{Emisor}from'./activos';
interface E extends Emisor{driver(key:string,label?:string,unit?:string):Expr[];base(key:string,label?:string):Expr[];}
export interface Fiscalidad {expense:Expr[];paid:Expr[];current:Expr[];deferred:Expr[];nol:Expr[];assets:Expr[];liabilities:Expr[];cfoAdjustment:Expr[];oci:Expr[];operatingPaid:Expr[];}
export function crearFiscalidad(e:E,pretax:Expr[],rates:Expr[],nolOpening:Expr):Fiscalidad{
 const d=(key:string,label:string,unit='importe')=>e.driver('tax.'+key,label,unit),s=(key:string,label:string,x:Expr[])=>e.serie('S_Fiscalidad','tax.'+key,label,x);
 const adjustment=d('adjustments','Ajustes al resultado fiscal'),limit=d('nolLimit','Límite de compensación de pérdidas','tasa'),payable=d('payable','Pasivo por impuesto corriente al cierre'),receivable=d('receivable','Activo por impuesto corriente al cierre'),dta=d('dta','Activo fiscal diferido reconocido al cierre'),dtl=d('dtl','Pasivo fiscal diferido al cierre'),oci=d('oci','Gasto fiscal diferido imputado a OCI (+gasto)'),operatingPaid=d('operatingPaid','Impuesto de caja del negocio sin financiación');
 const openPayable=e.base('taxPayable')[3],openReceivable=e.base('taxReceivable')[3],openDTA=e.base('deferredTaxAsset')[3],openDTL=e.base('deferredTaxLiability')[3];
 const current:Expr[]=[],nol:Expr[]=[];
 for(let i=0;i<5;i++){
  const before=add(pretax[i],adjustment[i]),taxable=max(0,before),opening=i?nol[i-1]:nolOpening,used=min(opening,mul(taxable,limit[i]));
  current[i]=e.celda('S_Fiscalidad','tax.current','Impuesto corriente devengado',i,iff(ge(limit[i],0),iff(ge(1,limit[i]),mul(sub(taxable,used),rates[i]),div(1,0)),div(1,0)));
  nol[i]=e.celda('S_Fiscalidad','tax.nol','Pérdidas fiscales pendientes',i,add(sub(opening,used),max(0,mul(-1,before))));
 }
 const delta=(x:Expr[],opening:Expr,i:number)=>sub(x[i],i?x[i-1]:opening),deferred=s('deferred','Impuesto diferido imputado a resultado',dtl.map((v,i)=>sub(sub(delta(dtl,openDTL,i),delta(dta,openDTA,i)),oci[i]))),expense=s('expense','Gasto fiscal total en resultados',current.map((v,i)=>add(v,deferred[i]))),paid=s('paid','Impuesto efectivamente pagado',current.map((v,i)=>add(v,delta(receivable,openReceivable,i),mul(-1,delta(payable,openPayable,i)))));
 const assets=s('assets','Activos fiscales corrientes y diferidos',dta.map((v,i)=>iff(ge(v,0),iff(ge(receivable[i],0),add(v,receivable[i]),div(1,0)),div(1,0)))),liabilities=s('liabilities','Pasivos fiscales corrientes y diferidos',dtl.map((v,i)=>iff(ge(v,0),iff(ge(payable[i],0),add(v,payable[i]),div(1,0)),div(1,0))));
 const cfoAdjustment=s('cfoAdjustment','Gasto fiscal menos pago de caja',expense.map((v,i)=>sub(v,paid[i])));
 return{expense,paid,current,deferred,nol,assets,liabilities,cfoAdjustment,oci,operatingPaid};
}
