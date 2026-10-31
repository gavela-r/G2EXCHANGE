/** Núcleo puro. La misma expresión se evalúa en TS y se emite a Excel. Sin IO. */
export type Valor = number | 'NO_ESTIMABLE';
export type Expr = number | {ref:string} | {op:string,args:Expr[]};
export interface Nodo { id:string; hoja:string; fila:number; columna:number; etiqueta:string; unidad:string; valor?:number|null; expr?:Expr; fuente?:string; }
export const ref=(id:string):Expr=>({ref:id});
export const op=(name:string,...args:Expr[]):Expr=>({op:name,args});
// Algebraic identities of an explicitly empty set, never a replacement for NULL.
// Excel rejects SUM() in the serialized XLSX; SUM requires an argument.
export const add=(...a:Expr[]):Expr=>a.length?op('SUM',...a):0, sub=(a:Expr,b:Expr)=>op('-',a,b),mul=(...a:Expr[]):Expr=>a.length?op('*',...a):1,div=(a:Expr,b:Expr)=>op('/',a,b);
export const min=(...a:Expr[])=>op('MIN',...a),max=(...a:Expr[])=>op('MAX',...a),pow=(a:Expr,b:Expr)=>op('^',a,b);
export const iff=(c:Expr,a:Expr,b:Expr)=>op('IF',c,a,b),ge=(a:Expr,b:Expr)=>op('>=',a,b),gt=(a:Expr,b:Expr)=>op('>',a,b);
export const letra=(col:number):string=>col>26?letra(Math.floor((col-1)/26))+String.fromCharCode(65+(col-1)%26):String.fromCharCode(64+col);
export class Grafo {
 readonly nodos:Nodo[]=[]; readonly indice=new Map<string,Nodo>();
 insertar(n:Nodo):Expr {if(this.indice.has(n.id))throw Error('Nodo duplicado: '+n.id);this.nodos.push(n);this.indice.set(n.id,n);return ref(n.id);}
 referencia(id:string):string {const n=this.indice.get(id);if(!n)throw Error('Referencia desconocida: '+id);return `'${n.hoja.replace(/'/g,"''")}'!${letra(n.columna)}${n.fila}`;}
 evaluar(cambios:Record<string,number|null>={}):Map<string,Valor> {
  const resultado=new Map<string,Valor>(),pendientes=new Set<string>();
  const visit=(id:string):Valor=>{if(resultado.has(id))return resultado.get(id)!;if(pendientes.has(id))throw Error('Ciclo: '+id);const n=this.indice.get(id);if(!n)throw Error('Referencia desconocida: '+id);pendientes.add(id);
   const ev=(e:Expr):Valor=>{if(typeof e==='number')return e;if('ref'in e)return visit(e.ref);
    if(e.op==='IF'){const c=ev(e.args[0]);return typeof c==='number'?ev(e.args[c?1:2]):'NO_ESTIMABLE';}
    if(e.op==='CHOOSE'){const c=ev(e.args[0]);return typeof c==='number'&&Number.isInteger(c)&&c>=1&&c<e.args.length?ev(e.args[c]):'NO_ESTIMABLE';}
    const vals=e.args.map(ev);if(vals.some(v=>typeof v!=='number'))return 'NO_ESTIMABLE';const a=vals as number[];let x:number;
    switch(e.op){case'SUM':x=a.reduce((s,v)=>s+v,0);break;case'*':x=a.reduce((s,v)=>s*v,1);break;case'-':x=a[0]-a[1];break;case'/':x=a[1]===0?NaN:a[0]/a[1];break;case'^':x=a[0]**a[1];break;case'MIN':x=Math.min(...a);break;case'MAX':x=Math.max(...a);break;case'>=':x=Number(a[0]>=a[1]);break;case'>':x=Number(a[0]>a[1]);break;case'=':x=Number(a[0]===a[1]);break;case'ABS':x=Math.abs(a[0]);break;case'LN':x=Math.log(a[0]);break;case'YEAR':x=new Date((a[0]-25569)*86400000).getUTCFullYear();break;case'MONTH':x=new Date((a[0]-25569)*86400000).getUTCMonth()+1;break;case'DAY':x=new Date((a[0]-25569)*86400000).getUTCDate();break;case'DATE':x=(Date.UTC(a[0],a[1]-1,a[2])-Date.UTC(1899,11,30))/86400000;break;default:throw Error('Operador no soportado '+e.op);}
    return Number.isFinite(x)?x:'NO_ESTIMABLE';
   };
   let v:Valor;if(n.expr!==undefined)v=ev(n.expr);else{const x=Object.prototype.hasOwnProperty.call(cambios,id)?cambios[id]:n.valor;v=typeof x==='number'&&Number.isFinite(x)?x:'NO_ESTIMABLE';}
   pendientes.delete(id);resultado.set(id,v);return v;
  };this.nodos.forEach(n=>visit(n.id));return resultado;
 }
 formula(n:Nodo):string {
  if(n.expr===undefined)throw Error('Es una entrada');
  const raw=(e:Expr):string=>{if(typeof e==='number')return String(e);if('ref'in e)return this.referencia(e.ref);const a=e.args.map(raw);const infix=['+','-','*','/','^','>=','>','='].includes(e.op);let x=infix?`(${a.join(e.op)})`:`${e.op}(${a.join(',')})`;if(['>=','>','='].includes(e.op))x='--'+x;return x;};
  const valid=(e:Expr):string=>{
   if(typeof e==='number')return Number.isFinite(e)?'TRUE':'FALSE';if('ref'in e)return `ISNUMBER(${this.referencia(e.ref)})`;
   if(e.op==='IF')return `IF(${valid(e.args[0])},IF(${raw(e.args[0])},${valid(e.args[1])},${valid(e.args[2])}),FALSE)`;
   if(e.op==='CHOOSE'){const a=e.args.map(raw);return `IF(${valid(e.args[0])},IF(AND(${a[0]}>=1,${a[0]}<=${a.length-1},MOD(${a[0]},1)=0),CHOOSE(${a[0]},${e.args.slice(1).map(valid).join(',')}),FALSE),FALSE)`;}
   const args=e.args.map(valid).filter(x=>x!=='TRUE');const all=args.length?`AND(${args.join(',')})`:'TRUE';
   if(e.op==='/')return `IF(${all},${raw(e.args[1])}<>0,FALSE)`;
   if(e.op==='LN')return `IF(${all},${raw(e.args[0])}>0,FALSE)`;
   return all;
  };return `=IF(${valid(n.expr)},${raw(n.expr)},"NO_ESTIMABLE")`;
 }
}
