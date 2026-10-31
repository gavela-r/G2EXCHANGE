import {Expr,ref,op,add,sub,mul,div,min,max,iff,ge,gt} from './grafo';
import {Cohorte,Emisor,ResultadoActivo,validarCohorte} from './activos';
export interface PeriodoActivo {start:string;end:string;fiscalStart?:string;fiscalEnd?:string;}
export interface EventoActivo {id:string;fecha:string;tipo:'ALTA'|'BAJA'|'DETERIORO'|'REVISION';importe?:number|null;fraccion?:number|null;cobro?:number|null;vidaNueva?:number|null;residualNuevo?:number|null;metodoNuevo?:Cohorte['metodo'];fechaPago?:string|null;reservasDispuestas?:number|null;}
export interface CohorteAvanzada extends Cohorte {eventos?:EventoActivo[];produccionSegmentos?:{inicio:string;fin:string;unidades:number|null;reservasAdiciones:number|null}[];pagoPendienteApertura?:number|null;}
export interface ResultadoAvanzado extends ResultadoActivo {reconocido:Expr[];capexPayable:Expr[];capexAdvance:Expr[];}
const serial=(s:string)=>{const t=Date.parse(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==s)throw Error('Fecha de evento inválida');return(t-Date.UTC(1899,11,30))/86400000;};
export function crearCohorteAvanzada(e:Emisor,c:CohorteAvanzada,periods:PeriodoActivo[],opts:{adicion?:Expr[];servicio?:Expr;produccion?:Expr[];reservasAdiciones?:Expr[]}={}):ResultadoAvanzado{
 validarCohorte(c);if(periods.length!==5)throw Error('Cinco períodos fiscales requeridos');
 const events=[...(c.eventos??[])].sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.id.localeCompare(b.id));
 if(new Set(events.map(x=>x.id)).size!==events.length)throw Error('Eventos de activo duplicados');
 const key='avanzado.'+c.id,constant=(id:string,label:string,v:number|null,unit='importe')=>e.constante(key+'.'+id,label+' '+c.id,v,unit),node=(id:string,label:string,i:number,x:Expr)=>e.celda('S_Activos',key+'.'+id,label+' '+c.id,i,x);
 let net:Expr=constant('net','Apertura neta',c.adicionAnio===null?c.neto:0),residual:Expr=constant('residual','Residual inicial',c.residual),life:Expr=constant('vida','Vida remanente',c.vida,'años'),rate=constant('tasa','Tasa decreciente',c.tasaDecreciente,'tasa'),reserves:Expr=constant('reservas','Reservas iniciales',c.reservas,'unidades'),method=c.metodo;
 const service=opts.servicio??constant('servicio','Puesta en servicio',c.fechaServicio?serial(c.fechaServicio):null,'fecha');
 const das:Expr[]=[],ends:Expr[]=[],paid:Expr[]=[],leases:Expr[]=[],impaired:Expr[]=[],disposed:Expr[]=[],proceeds:Expr[]=[],gains:Expr[]=[],recognized:Expr[]=[],payable:Expr[]=[],advance:Expr[]=[];
 let creditor:Expr=constant('payableOpening','Crédito de inversión inicial',c.pagoPendienteApertura??null);
 for(const event of events){serial(event.fecha);if(!event.id||!['ALTA','BAJA','DETERIORO','REVISION'].includes(event.tipo))throw Error('Evento desconocido');if(event.fecha<periods[0].start||event.fecha>periods[4].end)throw Error('Evento fuera de la ventana');if(event.fechaPago)serial(event.fechaPago);if(event.tipo==='ALTA'&&c.adicionAnio!==null&&opts.adicion)throw Error('No duplicar alta por vintage y evento');}
 for(let i=0;i<5;i++){
  const begin=serial(periods[i].start),finish=serial(periods[i].end)+1,days=periods[i].fiscalStart&&periods[i].fiscalEnd?serial(periods[i].fiscalEnd!)+1-serial(periods[i].fiscalStart!):finish-begin;
  if(i&&begin!==serial(periods[i-1].end)+1)throw Error('Períodos fiscales discontinuos');
  const current=events.filter(x=>x.fecha>=periods[i].start&&x.fecha<=periods[i].end),boundaries=[...new Set([begin,finish,...current.map(x=>serial(x.fecha))])].sort((a,b)=>a-b);
  let da:Expr=0,imp:Expr=0,bookDisposed:Expr=0,cashSale:Expr=0,addition:Expr=opts.adicion?.[i]??0,cashPaid:Expr=c.financiacion==='CAJA'?addition:0,lease:Expr=c.financiacion==='LEASE'?addition:0;
  net=node('apertura','Apertura + altas por vintage',i,add(net,addition));
  for(let j=0;j<boundaries.length-1;j++){
   const from=boundaries[j],until=boundaries[j+1],prefix='segmento'+j;
   for(const event of current.filter(x=>serial(x.fecha)===from)){
    const eventId='evento.'+event.id;
    if(event.tipo==='ALTA'){
     const amount=constant(eventId+'.alta','Alta reconocida '+event.fecha,event.importe??null);net=node(prefix+'.'+eventId+'.net','Neto después del alta',i,iff(ge(amount,0),add(net,amount),div(1,0)));addition=add(addition,amount);if(c.financiacion==='LEASE')lease=add(lease,amount);
    }else if(event.tipo==='DETERIORO'){
     const amount=constant(eventId+'.deterioro','Deterioro '+event.fecha,event.importe??null);net=node(prefix+'.'+eventId+'.net','Neto después de deterioro',i,iff(ge(amount,0),iff(ge(net,amount),sub(net,amount),div(1,0)),div(1,0)));imp=add(imp,amount);
    }else if(event.tipo==='BAJA'){
     const fraction=constant(eventId+'.fraccion','Fracción dispuesta '+event.fecha,event.fraccion??null,'tasa'),sold=node(prefix+'.'+eventId+'.baja','Valor contable dispuesto',i,iff(ge(fraction,0),iff(ge(1,fraction),mul(net,fraction),div(1,0)),div(1,0))),cash=constant(eventId+'.cobro','Cobro baja '+event.fecha,event.cobro??null);
     net=node(prefix+'.'+eventId+'.net','Neto después de baja',i,sub(net,sold));residual=node(prefix+'.'+eventId+'.residual','Residual retenido',i,mul(residual,sub(1,fraction)));bookDisposed=add(bookDisposed,sold);cashSale=add(cashSale,cash);
     if(method==='PRODUCCION'){const quantity=constant(eventId+'.reservas','Reservas dispuestas',event.reservasDispuestas??null,'unidades');reserves=node(prefix+'.'+eventId+'.reservasFin','Reservas después de baja',i,iff(ge(reserves,quantity),sub(reserves,quantity),div(1,0)));}
    }else{
     if(event.vidaNueva!==undefined)life=constant(eventId+'.vida','Nueva vida desde '+event.fecha,event.vidaNueva,'años');
     if(event.residualNuevo!==undefined)residual=constant(eventId+'.residual','Nuevo residual desde '+event.fecha,event.residualNuevo);
     if(event.metodoNuevo){if(!['LINEAL','SALDO_DECRECIENTE','PRODUCCION','NINGUNO'].includes(event.metodoNuevo)||(event.metodoNuevo==='NINGUNO')!==(c.clase==='NO_DEPRECIABLE'))throw Error('Cambio de método incompatible');method=event.metodoNuevo;}
    }
   }
   const fraction=node(prefix+'.fraccion','Fracción activa fiscal del segmento',i,div(max(0,sub(until,max(from,service))),days));
   const depreciable=max(0,sub(net,residual));let charge:Expr=0;
   if(method==='LINEAL'||method==='SALDO_DECRECIENTE'){
    const linear=iff(gt(life,0),mul(div(depreciable,life),min(life,fraction)),iff(gt(depreciable,0),div(1,0),0));
    charge=method==='LINEAL'?linear:iff(gt(rate,0),iff(ge(1,rate),min(depreciable,max(linear,mul(net,rate,fraction))),div(1,0)),div(1,0));
   }else if(method==='PRODUCCION'){
    const explicit=c.produccionSegmentos?.find(x=>serial(x.inicio)===from&&serial(x.fin)+1===until),quantity=boundaries.length===2?opts.produccion?.[i]??constant(prefix+'.produccion.'+i,'Producción fiscal',null,'unidades'):constant(prefix+'.produccion.'+i,'Producción del segmento',explicit?.unidades??null,'unidades');
    const additions=boundaries.length===2?opts.reservasAdiciones?.[i]??0:constant(prefix+'.reservasAlta.'+i,'Reservas añadidas en segmento',explicit?.reservasAdiciones??null,'unidades');reserves=node(prefix+'.reservasApertura','Reservas disponibles',i,add(reserves,additions));
    charge=iff(ge(quantity,0),iff(ge(reserves,quantity),iff(gt(reserves,0),mul(depreciable,div(quantity,reserves)),iff(gt(quantity,0),div(1,0),0)),div(1,0)),div(1,0));reserves=node(prefix+'.reservasCierre','Reservas después producción',i,sub(reserves,quantity));
   }
   const amount=node(prefix+'.da','D&A del segmento',i,iff(ge(net,0),iff(ge(residual,0),min(depreciable,charge),div(1,0)),div(1,0)));da=add(da,amount);net=node(prefix+'.cierre','Neto al final del segmento',i,sub(net,amount));if(method!=='NINGUNO'&&method!=='PRODUCCION')life=node(prefix+'.vidaFin','Vida remanente al final del segmento',i,max(0,sub(life,fraction)));
  }
  for(const event of events.filter(x=>x.tipo==='ALTA'&&c.financiacion==='CAJA')){if(!event.fechaPago){if(event.fecha>=periods[i].start&&event.fecha<=periods[i].end)cashPaid=add(cashPaid,constant('evento.'+event.id+'.pagoSinFecha','Pago sin fecha acreditada',null));}else if(event.fechaPago>=periods[i].start&&event.fechaPago<=periods[i].end)cashPaid=add(cashPaid,ref(key+'.evento.'+event.id+'.alta'));}
  creditor=node('capexPayable','Crédito de inversión al cierre',i,c.financiacion==='CAJA'?add(creditor,sub(addition,cashPaid)):creditor);
  das.push(node('da','D&A fiscal',i,da));ends.push(node('cierre','Valor neto al cierre fiscal',i,net));paid.push(node('pago','CapEx desembolsado',i,cashPaid));leases.push(node('lease','Alta ROU no monetaria',i,lease));impaired.push(node('deterioro','Deterioro fiscal',i,imp));disposed.push(node('baja','Valor contable de bajas',i,bookDisposed));proceeds.push(node('cobros','Cobros disposiciones',i,cashSale));gains.push(node('ganancia','Resultado en bajas',i,sub(cashSale,bookDisposed)));recognized.push(node('reconocido','Inversión reconocida',i,addition));payable.push(node('creditoPositivo','Pasivo por inversión al cierre',i,max(0,creditor)));advance.push(node('anticipo','Anticipo para inversión al cierre',i,max(0,mul(-1,creditor))));
 }
 return{depreciacion:das,cierre:ends,inversion:paid,lease:leases,deterioro:impaired,baja:disposed,cobros:proceeds,ganancia:gains,reconocido:recognized,capexPayable:payable,capexAdvance:advance,clase:c.clase,tipoCapex:c.tipoCapex,ids:{da:das.map(x=>(x as {ref:string}).ref),cierre:ends.map(x=>(x as {ref:string}).ref)}};
}
