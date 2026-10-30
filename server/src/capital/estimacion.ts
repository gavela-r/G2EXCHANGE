/** Herramienta de investigación: OLS con QR, controles explícitos y corte temporal fuera de muestra.
 * No transforma coeficientes de rentabilidad realizada en rentabilidad exigida ni aprueba primas.
 */
export interface ObservacionFactor {empresa:string;periodo:string;disponible:string;moneda:string;mercado:string;excesoRetorno:number;variables:Record<string,number>;fuente:string;}
export function estimarResidual(rows:ObservacionFactor[],variables:string[],finEntrenamiento:string){
 const required=['LIQUIDEZ','TAMANO','RIESGO_OPERATIVO','ENDEUDAMIENTO','RENTABILIDAD','CALIDAD','MERCADO'];
 if(!required.every(x=>variables.includes(x))||new Set(variables).size!==variables.length)throw Error('Controles residuales incompletos');
 const excluded:any[]=[],valid:ObservacionFactor[]=[];const seen=new Set<string>();
 for(const r of rows){const key=r.empresa+':'+r.periodo;
  if(seen.has(key))throw Error('Panel empresa/periodo duplicado');seen.add(key);
  if(r.disponible>=r.periodo||!r.fuente||!Number.isFinite(r.excesoRetorno)||variables.some(v=>!Number.isFinite(r.variables[v])))excluded.push({empresa:r.empresa,periodo:r.periodo,motivo:'Información futura, ausente o sin evidencia'});else valid.push(r);
 }
 if(new Set(valid.map(r=>r.moneda)).size>1||new Set(valid.map(r=>r.mercado)).size>1)throw Error('Monedas/mercados no comparables');
 const train=valid.filter(r=>r.periodo<=finEntrenamiento),test=valid.filter(r=>r.periodo>finEntrenamiento),p=variables.length+1;
 if(train.length<=p||test.length<1)return {estado:'NO_ESTIMABLE',motivo:'Sin observaciones suficientes para identificar controles y validar fuera de muestra',entrenamiento:train.length,prueba:test.length,excluidas:excluded,prima:null};
 const means=variables.map(v=>train.reduce((s,r)=>s+r.variables[v]/train.length,0));
 const scales=variables.map((v,j)=>Math.sqrt(train.reduce((s,r)=>s+(r.variables[v]-means[j])**2,0)/(train.length-1)));
 if(scales.some(s=>s===0))return {estado:'NO_ESTIMABLE',motivo:'Control sin variación; efecto residual no identificable',prima:null};
 const design=(r:ObservacionFactor)=>[1,...variables.map((v,j)=>(r.variables[v]-means[j])/scales[j])];
 const x=train.map(design),y=train.map(r=>r.excesoRetorno),q:number[][]=[],R=Array.from({length:p},()=>Array(p).fill(0));
 for(let j=0;j<p;j++){
  const v=x.map(row=>row[j]);
  // Reortogonalización reduce errores numéricos; rechaza colinealidad en lugar de inventar coeficientes.
  for(let pass=0;pass<2;pass++)for(let k=0;k<j;k++){const dot=v.reduce((s,a,i)=>s+a*q[k][i],0);R[k][j]+=dot;for(let i=0;i<v.length;i++)v[i]-=dot*q[k][i];}
  const norm=Math.hypot(...v);if(norm<Number.EPSILON*train.length*100)return {estado:'NO_ESTIMABLE',motivo:'Matriz de controles singular',prima:null};
  R[j][j]=norm;q[j]=v.map(a=>a/norm);
 }
 const z=q.map(col=>col.reduce((s,a,i)=>s+a*y[i],0)),b=Array(p).fill(0);
 for(let j=p-1;j>=0;j--){b[j]=(z[j]-R[j].slice(j+1).reduce((s,a,k)=>s+a*b[j+1+k],0))/R[j][j];}
 const predict=(r:ObservacionFactor)=>design(r).reduce((s,a,i)=>s+a*b[i],0);
 const rmse=(rs:ObservacionFactor[])=>Math.sqrt(rs.reduce((s,r)=>s+(r.excesoRetorno-predict(r))**2,0)/rs.length);
 const coefficients=Object.fromEntries(variables.map((v,j)=>[v,b[j+1]/scales[j]]));
 return {estado:'EXPERIMENTAL',metodo:'QR_OLS_REALIZED_RETURNS_V2',prima:null,autorizado:false,
  intercepto:b[0]-variables.reduce((s,_,j)=>s+coefficients[variables[j]]*means[j],0),coeficientes:coefficients,
  entrenamiento:{n:train.length,fin:finEntrenamiento,rmse:rmse(train)},fueraMuestra:{n:test.length,inicio:test.map(r=>r.periodo).sort()[0],rmse:rmse(test)},
  universo:[...new Set(valid.map(r=>r.empresa))],excluidas:excluded,
  limitaciones:['Rentabilidad realizada no es automáticamente coste de capital','No incluye inferencia robusta de panel ni validación de estabilidad; no autorizar coeficientes','Sesgo de supervivencia y de selección requiere universo histórico de excluidas/delistadas','Tamaño residual exige evidencia económica además de identificación estadística']};
}
