import {Grafo,Expr,ref,op,add,sub,mul,div,min,max,iff,ge,gt} from './grafo';
/** Calendario de cohorte neta, sin inferir coste bruto/depreciación acumulada desconocidos.
 * Eventos de baja y deterioro a cierre, después de D&A, expresamente identificados.
 * Fechas intraanuales de eventos requieren segmentos; esta API los rechaza, nunca los desplaza.
 */
export type Clase='PPE'|'INTANGIBLE'|'ROU'|'AGOTABLE'|'NO_DEPRECIABLE';
export interface Cohorte {id:string;clase:Clase;metodo:'LINEAL'|'SALDO_DECRECIENTE'|'PRODUCCION'|'NINGUNO';neto:number|null;residual:number|null;vida:number|null;tasaDecreciente:number|null;reservas:number|null;fechaServicio:string|null;fechaAdquisicion:string|null;adicionAnio:number|null;financiacion:'CAJA'|'LEASE'|'APERTURA';tipoCapex:'MANTENIMIENTO'|'CRECIMIENTO'|'NO_APLICABLE';}
export interface ResultadoActivo {depreciacion:Expr[];cierre:Expr[];inversion:Expr[];lease:Expr[];deterioro:Expr[];baja:Expr[];cobros:Expr[];ganancia:Expr[];clase:Clase;tipoCapex:Cohorte['tipoCapex'];ids:Record<string,string[]>;}
export interface Emisor {serie(hoja:string,id:string,label:string,expr:Expr[],unit?:string):Expr[];celda(hoja:string,id:string,label:string,indice:number,expr:Expr,unit?:string):Expr;entrada(hoja:string,id:string,label:string,values:(number|null)[],unit?:string):Expr[];constante(id:string,label:string,value:number|null,unit?:string):Expr;}
export function validarCohorte(c:Cohorte){
 if(!c.id)throw Error('Cohorte sin ID');
 if(!['PPE','INTANGIBLE','ROU','AGOTABLE','NO_DEPRECIABLE'].includes(c.clase)||!['LINEAL','SALDO_DECRECIENTE','PRODUCCION','NINGUNO'].includes(c.metodo))throw Error('Clase o método no admitido');
 if(c.adicionAnio!==null&&(!Number.isInteger(c.adicionAnio)||c.adicionAnio<0||c.adicionAnio>4))throw Error('Vintage fuera de la ventana');
 if(c.neto!==null&&c.neto<0)throw Error('Activo neto negativo');if(c.residual!==null&&(c.residual<0||(c.neto!==null&&c.residual>c.neto)))throw Error('Residual fuera de dominio');
 if(c.metodo==='NINGUNO'&&c.clase!=='NO_DEPRECIABLE')throw Error('Método no depreciable requiere clase explícita');
 if(c.clase==='NO_DEPRECIABLE'&&c.metodo!=='NINGUNO')throw Error('Activo no depreciable');
 if(c.metodo==='PRODUCCION'&&c.clase!=='AGOTABLE')throw Error('Unidades de producción requieren reservas acreditadas');
 if(c.vida!==null&&c.metodo!=='NINGUNO'&&c.metodo!=='PRODUCCION'&&c.vida<=0)throw Error('Vida útil no positiva');
 if(c.metodo==='SALDO_DECRECIENTE'&&c.tasaDecreciente!==null&&!(c.tasaDecreciente>0&&c.tasaDecreciente<=1))throw Error('Tasa decreciente fuera de dominio');
 if(c.reservas!==null&&c.reservas<=0)throw Error('Reservas no positivas');
 if(c.clase==='ROU'&&c.financiacion==='CAJA')throw Error('No confundir alta ROU y desembolso CapEx');
}
export function crearCohorte(e:Emisor,c:Cohorte,years:Expr[],opts:{adicion?:Expr[];servicio?:Expr;produccion?:Expr[];reservasAdiciones?:Expr[];bajas?:Expr[];deterioros?:Expr[];cobros?:Expr[]}={}):ResultadoActivo{
 validarCohorte(c);const key='activo.'+c.id;
 const inicial=e.constante(key+'.neto','Activo '+c.id+' neto / coste de alta',c.neto);
 const residual=e.constante(key+'.residual','Residual '+c.id,c.residual);
 const vida=e.constante(key+'.vida','Vida remanente '+c.id,c.vida,'años');
 const tasa=e.constante(key+'.tasa','Tasa decreciente '+c.id,c.tasaDecreciente,'tasa');
 const reservaInicial=e.constante(key+'.reservas','Reservas '+c.id,c.reservas,'unidades');
 const servicio=opts.servicio??e.constante(key+'.servicio','Puesta en servicio '+c.id,c.fechaServicio?fecha(c.fechaServicio):null,'fecha');
 const proporcion=e.entrada('S_Activos',key+'.baja','Baja al cierre, fracción del saldo '+c.id,[0,0,0,0,0],'tasa');
 const deterioros=opts.deterioros??e.entrada('S_Activos',key+'.impair','Deterioro al cierre '+c.id,[0,0,0,0,0]);
 const cobros=opts.cobros??e.entrada('S_Activos',key+'.cobros','Cobro de disposición '+c.id,[0,0,0,0,0]);
 const aperturas:Expr[]=[],das:Expr[]=[],cierres:Expr[]=[],imp:Expr[]=[],baja:Expr[]=[],gan:Expr[]=[],reservas:Expr[]=[],vidas:Expr[]=[],residuales:Expr[]=[];
 const adiciones=opts.adicion??years.map((_,i)=>c.adicionAnio===i?inicial:0);
 const inversion=years.map((_,i)=>c.financiacion==='CAJA'?adiciones[i]:0),lease=years.map((_,i)=>c.financiacion==='LEASE'?adiciones[i]:0);
 // Nodos por período, con el mismo programa emitido a Excel.
 const one=(suffix:string,label:string,i:number,x:Expr)=>e.celda('S_Activos',key+'.'+suffix,label+' '+c.id,i,x);
 for(let i=0;i<5;i++){
  const ini=op('DATE',years[i],1,1),fin=op('DATE',add(years[i],1),1,1),dias=sub(fin,ini);
  const activoDesde=max(ini,servicio),fraccion=div(max(0,sub(fin,activoDesde)),dias);
  const netoApertura=i?cierres[i-1]:(c.adicionAnio===null?inicial:0);
  const netoConAltas=add(netoApertura,adiciones[i]);
  aperturas[i]=one('apertura','Apertura + altas',i,iff(ge(netoConAltas,0),netoConAltas,div(1,0)));
  const residualAbierto=i?residuales[i-1]:residual;
  const disponible=max(0,sub(aperturas[i],residualAbierto));
  const vidaAbierta=i?vidas[i-1]:vida;
  const resAbierta=add(i?reservas[i-1]:reservaInicial,opts.reservasAdiciones?.[i]??0);
  let cargo:Expr=0;
  if(c.metodo==='LINEAL')cargo=iff(gt(vidaAbierta,0),min(disponible,mul(div(disponible,vidaAbierta),min(vidaAbierta,fraccion))),iff(gt(disponible,0),div(1,0),0));
  if(c.metodo==='SALDO_DECRECIENTE')cargo=iff(gt(vidaAbierta,0),iff(gt(tasa,0),iff(ge(1,tasa),min(disponible,max(mul(aperturas[i],tasa,fraccion),mul(div(disponible,vidaAbierta),min(vidaAbierta,fraccion)))),div(1,0)),div(1,0)),iff(gt(disponible,0),div(1,0),0));
  if(c.metodo==='PRODUCCION'){
   const produccion=opts.produccion?.[i]??e.constante(key+'.produccion.'+i,'Producción '+c.id+' período '+(i+1),null,'unidades');
   cargo=iff(gt(aperturas[i],0),iff(ge(produccion,0),iff(ge(resAbierta,produccion),iff(gt(resAbierta,0),mul(disponible,div(produccion,resAbierta)),0),div(1,0)),div(1,0)),0);
   reservas[i]=one('reservasFin','Reservas al cierre',i,iff(gt(aperturas[i],0),sub(resAbierta,produccion),resAbierta));
  }
  // Residual/vida vacíos no se convierten en cero. Un coste cero atestado sí se conserva.
  const calculada=c.metodo==='NINGUNO'?0:(c.adicionAnio!==null&&i<c.adicionAnio?0:iff(ge(aperturas[i],residualAbierto),cargo,div(1,0)));
  das[i]=one('da','Depreciación / agotamiento',i,iff(ge(residualAbierto,0),calculada,div(1,0)));
  const postDA=sub(aperturas[i],das[i]);
  imp[i]=one('deterioro','Deterioro contabilizado',i,iff(ge(deterioros[i],0),iff(ge(max(0,sub(postDA,residualAbierto)),deterioros[i]),deterioros[i],div(1,0)),div(1,0)));
  const postImp=sub(postDA,imp[i]);const fraction=opts.bajas?.[i]??proporcion[i];
  baja[i]=one('valorBaja','Valor contable de la baja',i,iff(ge(fraction,0),iff(ge(1,fraction),mul(postImp,fraction),div(1,0)),div(1,0)));
  cierres[i]=one('cierre','Valor neto al cierre',i,sub(postImp,baja[i]));
  residuales[i]=one('residualFin','Residual retenido al cierre',i,mul(residualAbierto,sub(1,fraction)));
  gan[i]=one('ganancia','Resultado de disposición',i,sub(cobros[i],baja[i]));
  vidas[i]=one('vidaFin','Vida restante al cierre',i,c.metodo==='NINGUNO'||c.metodo==='PRODUCCION'?0:max(0,sub(vidaAbierta,fraccion)));
 }
 return {depreciacion:das,cierre:cierres,inversion,lease,deterioro:imp,baja,cobros,ganancia:gan,clase:c.clase,tipoCapex:c.tipoCapex,ids:{da:das.map(x=>(x as {ref:string}).ref),cierre:cierres.map(x=>(x as {ref:string}).ref)}};
}
function fecha(s:string):number{const t=Date.parse(s+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==s)throw Error('Fecha de servicio inválida');return(t-Date.UTC(1899,11,30))/86400000;}
