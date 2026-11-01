/** Tolerancia exclusivamente numérica IEEE-754: no altera resultados, tasas ni datos. */
export function compararCongelado(stored:unknown,computed:unknown,context?:{input:any;output:any}){
 const differences:{path:string;stored:unknown;computed:unknown;numericEquivalent:boolean;absoluteDifference?:number;calculationScale?:number}[]=[];
 function scale(p:string,a:number,b:number){
  let s=Math.max(1,Math.abs(a),Math.abs(b));const match=p.match(/^\$\.valuations\.(\d+)\.(valor_empresa_millones|valor_patrimonio_millones)$/);
  if(context&&match){const v=context.output.valuations[Number(match[1])],i=context.input;
   if(Array.isArray(v.proyeccion_fcff)&&v.proyeccion_fcff.length===5&&Number.isFinite(v.wacc)&&Number.isFinite(v.valor_empresa_millones)){
    const terms=v.proyeccion_fcff.map((f:number,k:number)=>f/(1+v.wacc)**(k+1-(i.discount_convention==='MID_YEAR'?.5:0)));
    const pv=terms.reduce((x:number,y:number)=>x+y,0),terminalPv=v.valor_empresa_millones-pv;
    s=Math.max(s,terms.reduce((x:number,y:number)=>x+Math.abs(y),0)+Math.abs(terminalPv));
    if(match[2]==='valor_patrimonio_millones')s+=Math.abs(i.gross_debt_fy0??0)+Math.abs(i.cash_fy0??0)+Math.abs(i.minority_interest_fy0??0);
   }
  }return s;
 }
 function visit(a:any,b:any,p:string){
  if(Object.is(a,b))return;
  if(typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)){
   const calculationScale=scale(p,a,b);differences.push({path:p,stored:a,computed:b,absoluteDifference:Math.abs(a-b),calculationScale,numericEquivalent:Math.abs(a-b)<=8*Number.EPSILON*calculationScale});return;
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
   for(const k of new Set([...Object.keys(a),...Object.keys(b)]))visit(a[k],b[k],p+'.'+k);return;
  }
  differences.push({path:p,stored:a,computed:b,numericEquivalent:false});
 }visit(stored,computed,'$');
 return {exact:!differences.length,numericallyEquivalent:differences.every(d=>d.numericEquivalent),differences,tolerance:'8 × Number.EPSILON × escala de cálculo; en EV/Equity con cancelación, suma de operandos absolutos descontados. Resto max(1, |a|, |b|). Textos/estructura exactos. No se redondean ni sobrescriben resultados.'};
}
