export interface Fuente {empresaId:string;ejercicio:number;concepto:string;importe:number|null;moneda:string;escala:number;unidad:string;norma:string;perimetro:string;documento:string;publicado:string;validacion:'VALIDADO'|'PENDIENTE';}
export function leerDato(f:Fuente,contexto:{empresaId:string;moneda:string;norma:string;perimetro:string;asOf:string}):number|null{
 if(f.empresaId!==contexto.empresaId||f.moneda!==contexto.moneda||f.norma!==contexto.norma||f.perimetro!==contexto.perimetro)throw Error('Contexto contable incompatible');
 if(!f.documento||!f.unidad||!(f.escala>0)||!/^\d{4}-\d{2}-\d{2}/.test(f.publicado)||!Number.isFinite(Date.parse(f.publicado)))throw Error('Procedencia incompleta');
 if(f.publicado.slice(0,10)>contexto.asOf)throw Error('Dato posterior a asOf');
 if(f.validacion!=='VALIDADO'||f.importe===null)return null;
 if(!Number.isFinite(f.importe))throw Error('Importe no finito');return f.importe*f.escala;
}
export function ventana(cierres:number[]){
 const orden=[...cierres].sort((a,b)=>a-b);if(new Set(orden).size!==orden.length||orden.some(x=>!Number.isInteger(x)))throw Error('Ejercicios duplicados o inválidos');
 if(orden.length<4)throw Error('Se requieren cuatro cierres completos');const h=orden.slice(-4);
 if(h.some((v,i)=>i>0&&v!==h[i-1]+1))throw Error('Históricos no consecutivos');return{historicos:h,proyecciones:Array.from({length:5},(_,i)=>h[3]+i+1)};
}
export const serial=(fecha:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!Number.isFinite(Date.parse(fecha))||new Date(fecha+'T00:00:00Z').toISOString().slice(0,10)!==fecha)throw Error('Fecha inválida');return (Date.parse(fecha+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;};
