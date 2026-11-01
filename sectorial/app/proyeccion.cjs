// Proyección financiera adaptativa (G2_PROYECCION_ADAPTATIVA_0.1). Funciones puras, sin E/S.
// Principios: sólo históricos acreditados y consecutivos; los originales nunca se modifican (los ajustes se expresan como
// pesos y se conserva siempre la estimación sin ajustar); un año atípico es POSIBLE, nunca se atribuye a un acontecimiento
// por coincidencia temporal (sólo es EXTRAORDINARIO_DOCUMENTADO si el analista aporta fuente); con 1 ejercicio no hay
// tendencia propia y con 2 el análisis es condicionado. Cada resultado declara técnica, años, pesos, motivo y confianza.
const VERSION='G2_PROYECCION_ADAPTATIVA_0.1';
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const mad=a=>{const m=median(a);return m===null?null:median(a.map(x=>Math.abs(x-m)))*1.4826;};
const std=a=>{if(a.length<2)return null;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));};
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
// Tramo consecutivo más largo que termina en el último ejercicio acreditado (no se salta un año ausente).
function tramo(serie){
 const p=serie.filter(x=>Number.isFinite(x?.value)).sort((a,b)=>a.year-b.year);if(!p.length)return[];
 const out=[p.at(-1)];for(let i=p.length-2;i>=0;i--){if(p[i].year!==out[0].year-1)break;out.unshift(p[i]);}return out;
}
function theilSen(xs,ys){const s=[];for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++)s.push((ys[j]-ys[i])/(xs[j]-xs[i]));return median(s);}
// Detección de posibles años atípicos dejando uno fuera. Umbral: desviación relativa > max(minimo, 4 × dispersión robusta
// del resto). Con series cortas el resultado se califica siempre como POSIBLE.
function atipicos(t,{relativo,minimo,documentados=[]}){
 const n=t.length,out=[];if(n<3)return out;
 const v=t.map(x=>x.value),g=v.slice(1).map((x,i)=>relativo?x/v[i]-1:x-v[i]);
 for(let k=0;k<n;k++){
  let pred,resto,tipo;
  if(k===0){resto=g.slice(1);const m=median(resto);pred=relativo?v[1]/(1+m):v[1]-m;tipo='POSIBLE_EXTRAORDINARIO_O_CAMBIO_DE_NIVEL';}
  else if(k===n-1){resto=g.slice(0,-1);const m=median(resto);pred=relativo?v[k-1]*(1+m):v[k-1]+m;tipo='POSIBLE_CAMBIO_RECIENTE';}
  else{resto=g.filter((_,i)=>i!==k-1&&i!==k);pred=relativo?(v[k-1]>0&&v[k+1]>0?Math.sqrt(v[k-1]*v[k+1]):(v[k-1]+v[k+1])/2):(v[k-1]+v[k+1])/2;tipo='POSIBLE_EXTRAORDINARIO';}
  if(relativo&&!(pred>0))continue;
  const d=relativo?v[k]/pred-1:v[k]-pred,escala=Math.max(minimo,4*(mad(resto)??0));
  if(Math.abs(d)>escala)out.push({year:t[k].year,tipo,desviacion:d,umbral:escala,prediccionResto:pred,motivo:'Desviación respecto a la evolución del resto de ejercicios; no se atribuye causa'});
 }
 // Un pico intermedio que revierte también desvía a sus vecinos: se conserva sólo el de mayor desviación por vecindad.
 const fil=out.filter(a=>!out.some(b=>b!==a&&Math.abs(b.year-a.year)===1&&Math.abs(b.desviacion/b.umbral)>Math.abs(a.desviacion/a.umbral)));
 for(const d of documentados){const a=fil.find(x=>x.year===d.year);if(a&&d.fuente){a.tipo='EXTRAORDINARIO_DOCUMENTADO';a.fuente=d.fuente;a.descripcion=d.descripcion??null;}}
 return fil;
}
function patron(g){
 if(!g.length)return'INSUFICIENTE';const s=std(g)??0;
 if(g.every(x=>Math.abs(x)<=0.03))return'ESTABLE';
 // Salto inicial seguido de estabilidad: el primer año no representa el nivel actual (extraordinario o cambio de nivel).
 if(g.length>=3&&Math.abs(g[0])>0.1&&g.slice(1).every(x=>Math.abs(x)<=0.06))return'SALTO_INICIAL_Y_ESTABILIDAD';
 // Recuperación: caída y subidas posteriores que recuperan al menos la mitad de lo perdido.
 if(g.length>=3&&g[0]<-0.02&&g.slice(1).every(x=>x>0.02)&&g.slice(1).reduce((p,x)=>p*(1+x),1)-1>=-g[0]/2)return'RECUPERACION';
 if(g.length>=2&&s>0.2)return'ALTA_VOLATILIDAD';
 if(g.every(x=>x>0.02))return g.length>=3&&g.every((x,i)=>!i||x>g[i-1]+0.01)?'ACELERACION':g.length>=3&&g.every((x,i)=>!i||x<g[i-1]-0.01)?'DESACELERACION':'CRECIMIENTO_SOSTENIDO';
 if(g.every(x=>x<-0.02))return'DECRECIMIENTO_SOSTENIDO';
 return'MIXTO';
}
// Variable de nivel con crecimiento (ingresos, base de costes...). referencia: crecimiento sectorial calculado con datos
// de otras empresas del mismo período (sin información futura).
function analizarCrecimiento(serie,{referencia=null,documentados=[]}={}){
 const t=tramo(serie),n=t.length,base={version:VERSION,tipo:'CRECIMIENTO',n,ejercicios:t.map(x=>x.year),advertencias:[]};
 if(!n)return{...base,estado:'SIN_DATOS'};
 if(t.some(x=>!(x.value>0)))return{...base,estado:'SIGNO_NO_POSITIVO',advertencias:['Valores no positivos: no se calculan tasas de crecimiento']};
 const v=t.map(x=>x.value),g=v.slice(1).map((x,i)=>x/v[i]-1),anom=atipicos(t,{relativo:true,minimo:0.25,documentados});
 const cagr=n>=2?(v.at(-1)/v[0])**(1/(n-1))-1:null,ts=n>=3?Math.exp(theilSen(t.map(x=>x.year),v.map(Math.log)))-1:null;
 // Pesos: recientes pesan más; un posible atípico no reciente recibe peso 0 en el ajustado (el original se conserva).
 const excl=new Set(anom.filter(a=>a.tipo!=='POSIBLE_CAMBIO_RECIENTE').map(a=>a.year));
 const pares=g.map((x,i)=>({x,desde:t[i].year,hasta:t[i+1].year,peso:i+1}));
 const ajustados=pares.filter(p=>!excl.has(p.desde)&&!excl.has(p.hasta));
 // Pico intermedio excluido: se tiende un puente con la tasa compuesta de dos años alrededor del año excluido.
 for(const y of excl){const i=t.findIndex(x=>x.year===y);if(i>0&&i<n-1)ajustados.push({x:Math.sqrt(v[i+1]/v[i-1])-1,desde:t[i-1].year,hasta:t[i+1].year,peso:i+0.5,puente:true});}
 const pond=ps=>ps.length?ps.reduce((s,p)=>s+p.x*p.peso,0)/ps.reduce((s,p)=>s+p.peso,0):null;
 const sd=std(g),sdAjustada=std(ajustados.map(p=>p.x)),vol=sdAjustada!==null&&sdAjustada>0.2;
 let metodo,g0,confianza,motivo;const sinAjuste=pond(pares);
 if(n===1){metodo='SIN_TENDENCIA_PROPIA';g0=referencia;confianza='BAJA';motivo='Un único ejercicio: no se extrapola tendencia propia; se usa la referencia sectorial'+(referencia===null?' (no disponible: sin proyección automática)':'');}
 else if(n===2){metodo='CONDICIONADO_DOS_EJERCICIOS';g0=referencia===null?g[0]:0.5*g[0]+0.5*referencia;confianza='BAJA';motivo='Dos ejercicios: una sola variación; no constituye una tendencia robusta y se combina con la referencia sectorial';base.advertencias.push('TENDENCIA_NO_ROBUSTA');}
 else if(vol){const m=median(ajustados.map(p=>p.x));metodo='MEDIANA_ENCOGIDA_HACIA_SECTOR';g0=referencia===null?m:0.5*m+0.5*referencia;confianza='BAJA';motivo='Alta volatilidad: mediana robusta de las variaciones, encogida hacia la referencia sectorial';}
 else{metodo='MEDIA_PONDERADA_RECIENTE';g0=pond(ajustados);confianza=n>=4&&!anom.length?'ALTA':'MEDIA';motivo='Variaciones interanuales con más peso en las recientes'+(excl.size?'; años posiblemente atípicos con peso 0':'');}
 if(anom.some(a=>a.tipo==='POSIBLE_CAMBIO_RECIENTE')){confianza='BAJA';base.advertencias.push('POSIBLE_CAMBIO_RECIENTE: el último ejercicio se aparta de la evolución previa');}
 // Validación retrospectiva (tools/backtest_proyeccion.cjs): con un posible atípico, extrapolar cualquier tendencia propia
 // (ajustada o no) empeora la predicción; se parte del último valor sin crecimiento propio y la senda revierte al destino.
 // La tasa ajustada se conserva para comparación.
 let estimacionAjustada=null;if(anom.length&&n>=3&&metodo!=='SIN_TENDENCIA_PROPIA'){estimacionAjustada={metodo,g0};metodo='ATIPICO_SIN_EXTRAPOLACION';g0=0;confianza='BAJA';motivo='Posible año atípico: no se extrapola tendencia propia (la validación retrospectiva muestra más error al extrapolar); la senda revierte al crecimiento de largo plazo';}
 if(referencia!==null&&g0!==null&&Math.sign(g0)!==Math.sign(referencia)&&Math.abs(g0-referencia)>0.25)base.advertencias.push('TENDENCIA_DIVERGENTE_DEL_SECTOR');
 const pesos=Object.fromEntries(t.map(x=>[x.year,excl.has(x.year)?0:1]));
 return{...base,estado:g0===null?'SIN_REFERENCIA':'ESTIMADO',valores:v,variaciones:g,cagr,theilSen:ts,mediana:median(g),volatilidad:sd,patron:patron(g),patronAjustado:excl.size?patron(ajustados.filter(p=>!p.puente).map(p=>p.x)):patron(g),atipicos:anom,pesos,
  estimacion:{metodo,g0,confianza,motivo,paresUsados:ajustados.map(p=>[p.desde,p.hasta,p.puente?'PUENTE':'DIRECTO'])},estimacionAjustada,sinAjustar:{metodo:'MEDIA_PONDERADA_RECIENTE_SIN_AJUSTE',g0:n>=2?sinAjuste:null},
  dispersion:mad(ajustados.map(p=>p.x))??sd??null};
}
// Ratio (márgenes, días, tasas sobre ingresos): se proyecta como nivel, no con la tasa de los ingresos.
function analizarRatio(serie,{minimo=0.05,referencia=null,documentados=[]}={}){
 const t=tramo(serie),n=t.length,base={version:VERSION,tipo:'RATIO',n,ejercicios:t.map(x=>x.year),advertencias:[]};
 if(!n)return{...base,estado:'SIN_DATOS'};
 const v=t.map(x=>x.value),anom=atipicos(t,{relativo:false,minimo,documentados}),excl=new Set(anom.filter(a=>a.tipo!=='POSIBLE_CAMBIO_RECIENTE').map(a=>a.year));
 const usados=t.filter(x=>!excl.has(x.year)),w=usados.map((_,i)=>i+1),pond=usados.reduce((s,x,i)=>s+x.value*w[i],0)/w.reduce((a,b)=>a+b,0);
 let metodo,nivel,confianza,motivo;
 if(n===1){metodo='NIVEL_UNICO_OBSERVADO';nivel=referencia===null?v[0]:0.5*v[0]+0.5*referencia;confianza='BAJA';motivo='Un ejercicio: nivel observado'+(referencia===null?'':' combinado con la referencia sectorial')+'; sin tendencia';}
 else if(n===2){metodo='MEDIA_DOS_EJERCICIOS';nivel=mean(v);confianza='BAJA';motivo='Dos ejercicios: media simple; análisis condicionado';}
 else{metodo='MEDIA_PONDERADA_RECIENTE';nivel=pond;confianza=n>=4&&!anom.length?'ALTA':'MEDIA';motivo='Nivel normal ponderado hacia los ejercicios recientes'+(excl.size?'; años posiblemente atípicos con peso 0':'');}
 if(anom.some(a=>a.tipo==='POSIBLE_CAMBIO_RECIENTE'))confianza='BAJA';
 return{...base,estado:'ESTIMADO',valores:v,ultimo:v.at(-1),mediana:median(v),atipicos:anom,pesos:Object.fromEntries(t.map(x=>[x.year,excl.has(x.year)?0:1])),
  estimacion:{metodo,nivel,confianza,motivo},sinAjustar:{metodo:'MEDIA_PONDERADA_RECIENTE_SIN_AJUSTE',nivel:v.reduce((s,x,i)=>s+x*(i+1),0)/v.reduce((s,_,i)=>s+i+1,0)},dispersion:mad(v)??std(v)??0};
}
// Trayectorias a cinco años con reversión gradual: x_t = destino + (inicio − destino) × φ^t. Tres escenarios.
const ESCENARIOS={conservador:{phi:0.5,desplazamiento:-1},central:{phi:0.6,desplazamiento:0},optimista:{phi:0.7,desplazamiento:1}};
function trayectoriaCrecimiento(a,{destino=0.025,anios=5,minimo=0.02}={}){
 if(a.estado!=='ESTIMADO')return null;const sigma=Math.max(minimo,a.dispersion??minimo);
 return Object.fromEntries(Object.entries(ESCENARIOS).map(([k,e])=>{const g0=a.estimacion.g0+e.desplazamiento*sigma,dest=destino+e.desplazamiento*0.01;
  return[k,Array.from({length:anios},(_,i)=>clamp(dest+(g0-dest)*e.phi**(i+1),-0.95,3))];}));
}
// Ratios: reversión lenta (φ por escenario) desde el último valor; elegido con la validación retrospectiva (el último
// valor es el mejor predictor a un año de márgenes, CapEx y días; la reversión rápida añadía error).
const ESCENARIOS_RATIO={conservador:{phi:0.85,desplazamiento:-1},central:{phi:0.9,desplazamiento:0},optimista:{phi:0.95,desplazamiento:1}};
function trayectoriaRatio(a,{anios=5,minimo=0.01,favorable=1,limites=[-Infinity,Infinity],escenarios=ESCENARIOS_RATIO}={}){
 if(a.estado!=='ESTIMADO')return null;const sigma=Math.max(minimo,a.dispersion??minimo);
 return Object.fromEntries(Object.entries(escenarios).map(([k,e])=>{const dest=a.estimacion.nivel+favorable*e.desplazamiento*sigma;
  return[k,Array.from({length:anios},(_,i)=>clamp(dest+(a.ultimo-dest)*e.phi**(i+1),limites[0],limites[1]))];}));
}
// Proyecciones simples de referencia para la validación retrospectiva.
const simples={
 ultimo:t=>t.at(-1).value,
 media:t=>mean(t.map(x=>x.value)),
 cagr:t=>t.length>=2&&t[0].value>0&&t.at(-1).value>0?t.at(-1).value*(t.at(-1).value/t[0].value)**(1/(t.length-1)):t.at(-1).value
};
module.exports={VERSION,ESCENARIOS,ESCENARIOS_RATIO,tramo,analizarCrecimiento,analizarRatio,trayectoriaCrecimiento,trayectoriaRatio,atipicos,patron,simples,median,mad};
