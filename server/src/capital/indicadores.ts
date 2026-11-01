import {fechaCivil} from './fecha';
import {media,desviacionMuestral} from '../../../valuation_engine/research/coste_capital/src/indicadores';
export interface Barra {fecha:string;cierre:number;ajustado:number|null;volumen:number|null;importe:number|null;tipoImporte:string;moneda:string;feed:string;ajuste:string;estado:string;id:number|string;}
export function liquidezBursatil(bars:Barra[],window:number,asOf:string,calendar?:{sesiones:string[];fuente:string;verificado:boolean}){
 fechaCivil(asOf);if(!Number.isInteger(window)||window<2||window>1260)throw Error('Ventana entre 2 y 1260 sesiones');
 const xs=bars.filter(b=>b.fecha<=asOf).sort((a,b)=>a.fecha.localeCompare(b.fecha));
 if(new Set(xs.map(x=>x.fecha)).size!==xs.length)throw Error('Sesiones duplicadas; seleccionar fuente/feed/revisión');
 const excluded:{id:number|string;motivo:string}[]=[],used:{id:number|string;fecha:string;retorno:number;importe:number;estimado:boolean}[]=[];
 const tail=xs.slice(-(window+1));
 for(let i=1;i<tail.length;i++){const p=tail[i-1],b=tail[i];let reason='';
  if(p.estado!=='VALID'||b.estado!=='VALID')reason='Observación no conciliada';
  else if(p.moneda!==b.moneda||p.feed!==b.feed)reason='Moneda/feed incompatibles';
  else if(p.ajuste!==b.ajuste||!['ALL','SPLIT_DIVIDEND','VERIFIED_NO_ACTIONS'].includes(b.ajuste))reason='Ajustes corporativos no acreditados';
  else if(!(p.ajustado!>0&&b.ajustado!>0))reason='Falta precio ajustado compatible';
  else if(!(b.importe!>0)||!['OBSERVED','ESTIMATED'].includes(b.tipoImporte))reason='Importe monetario ausente o no positivo';
  if(reason){excluded.push({id:b.id,motivo:reason});continue;}
  used.push({id:b.id,fecha:b.fecha,retorno:b.ajustado!/p.ajustado!-1,importe:b.importe!,estimado:b.tipoImporte==='ESTIMATED'});
 }
 const expected=calendar?.sesiones.filter(d=>d<=asOf).sort().slice(-(window+1));
 const calendarValid=calendar?.verificado===true&&!!calendar.fuente&&expected?.length===window+1
  &&new Set(expected).size===expected.length&&JSON.stringify(expected)===JSON.stringify(tail.map(b=>b.fecha));
 const complete=calendarValid&&tail.length===window+1&&used.length===window;
 const volumes=tail.slice(1).filter(b=>b.estado==='VALID'&&b.volumen!=null).map(b=>b.volumen!);
 return {ventana:window,estado:complete?'CALCULABLE':'NO_ESTIMABLE',amihud:complete?media(used.map(b=>Math.abs(b.retorno)/b.importe)):null,
 unidad:'INV_MONEDA',moneda:tail[0]?.moneda??null,sesiones:used,descartadas:excluded,observaciones:tail.length,
 calendarioVerificado:!!calendarValid,fuenteCalendario:calendar?.fuente??null,calendarioSesiones:expected??[],limitaciones:calendarValid?[]:['Calendario de sesiones esperado sin acreditar o incompleto; no inferir sesiones de las propias cotizaciones'],
 importeEstimado:used.some(x=>x.estimado),volumenMedio:volumes.length?media(volumes):null,
 cvVolumen:volumes.length>1&&media(volumes)>0?desviacionMuestral(volumes)!/media(volumes):null,
 diasSinNegociacion:tail.filter(b=>b.estado==='VALID'&&b.volumen===0).map(b=>b.fecha),
 sesionesAusentesNoEquivalenACero:true,prima:{estado:'NO_ESTIMABLE',valor:null,razon:'Indicador no es una prima; no existe calibración aprobada'}};
}
export interface PruebaCapitalizacion {
 identidadVerificada:boolean;claseVerificada:boolean;accionesEnCirculacion:number|null;tipoAcciones:'OUTSTANDING'|'ISSUED'|'DILUTED'|'UNKNOWN';
 fechaAcciones:string|null;precio:number|null;fechaPrecio:string|null;moneda:string|null;monedaPrecio:string|null;
 corporateActionsConciliadas:boolean;adrRatioConciliado:boolean;clasesSinDuplicacion:boolean;publicacion:string|null;evidencia:string[];bloqueo?:string;
}
export function capitalizacion(p:PruebaCapitalizacion,asOf:string){
 fechaCivil(asOf);const missing:string[]=[];
 if(p.bloqueo)return {estado:'CAPITALIZACION_BLOQUEADA',valor:null,limitaciones:[p.bloqueo],evidencia:p.evidencia};
 if(!p.identidadVerificada)missing.push('Identidad sin acreditar');if(!p.claseVerificada||!p.clasesSinDuplicacion)missing.push('Clase/emisor no conciliados');
 if(p.tipoAcciones!=='OUTSTANDING')missing.push('No son acciones efectivamente en circulación');
 if(!p.fechaAcciones||!p.fechaPrecio||p.fechaAcciones!==p.fechaPrecio)missing.push('Fechas distintas sin conciliación de movimientos de capital');
 for(const d of [p.fechaAcciones,p.fechaPrecio,p.publicacion])if(d){try{fechaCivil(d);}catch{missing.push('Fecha civil inválida');}}
 if(!p.publicacion||p.publicacion>asOf||p.fechaPrecio!>asOf||p.fechaAcciones!>asOf)missing.push('Disponibilidad temporal no acreditada');
 if(p.publicacion&&p.fechaAcciones&&p.publicacion<p.fechaAcciones)missing.push('Publicación anterior al dato de acciones');
 if(!/^[A-Z]{3}$/.test(p.moneda??'')||p.moneda!==p.monedaPrecio)missing.push('Moneda incompatible');
 if(!p.corporateActionsConciliadas||!p.adrRatioConciliado)missing.push('Splits/ADR no conciliados');
 const numeric=p.precio!=null&&Number.isFinite(p.precio)&&p.precio>0&&p.accionesEnCirculacion!=null&&Number.isSafeInteger(p.accionesEnCirculacion)&&p.accionesEnCirculacion>0&&Number.isFinite(p.precio*p.accionesEnCirculacion);
 if(!numeric)missing.push('Falta precio o acciones');
 if(!p.evidencia.length)missing.push('Sin evidencia documental');
 return {estado:missing.length?(numeric?'CAPITALIZACION_PARCIAL':'CAPITALIZACION_NO_DISPONIBLE'):'CAPITALIZACION_VALIDADA',
 valor:missing.length?null:p.precio!*p.accionesEnCirculacion!,productoNoValidado:numeric?p.precio!*p.accionesEnCirculacion!:null,
 moneda:p.moneda,fechaPrecio:p.fechaPrecio,fechaAcciones:p.fechaAcciones,limitaciones:missing,evidencia:p.evidencia};
}
