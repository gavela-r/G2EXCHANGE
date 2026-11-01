// Validación retrospectiva sin información futura del motor adaptativo (proyeccion.cjs) frente a métodos simples.
// Para cada año objetivo T (2025, 2024) y longitud de historia h (1–3 ejercicios consecutivos que terminan en T−1) se
// predice el valor de T con: último valor, media, CAGR y adaptativo (primer año de la senda central). La referencia
// sectorial se calcula sólo con ejercicios <= T−1. Métricas: ingresos → error porcentual absoluto; ratios → error absoluto
// (puntos porcentuales o días). Sólo históricos acreditados (VALIDADO/DERIVADO) del extracto tools/historicos_mysql.cjs.
// Uso: node tools/backtest_proyeccion.cjs <historicos.json> <salida.json>
const fs=require('node:fs'),path=require('node:path'),P=require(path.join(__dirname,'..','proyeccion.cjs'));
const [entrada,salida]=process.argv.slice(2),PHI=process.env.PHI_RATIO?Number(process.env.PHI_RATIO):null,SOLO_T=process.env.SOLO_T?Number(process.env.SOLO_T):null,H=JSON.parse(fs.readFileSync(entrada,'utf8'));
const val=(p,k)=>{const c=p.campos[k];return c&&(c.e==='VALIDADO'||c.e==='DERIVADO')&&c.v!=null?Number(c.v):NaN;};
const VARIABLES={
 ingresos:{tipo:'CRECIMIENTO',fn:p=>val(p,'revenue'),unidad:'%'},
 margenEbitda:{tipo:'RATIO',fn:p=>(val(p,'ebit')+val(p,'da'))/val(p,'revenue'),minimo:0.03,escala:100,unidad:'pp',limites:[-0.5,0.9]},
 margenEbit:{tipo:'RATIO',fn:p=>val(p,'ebit')/val(p,'revenue'),minimo:0.03,escala:100,unidad:'pp',limites:[-1,0.9]},
 capexSobreIngresos:{tipo:'RATIO',fn:p=>val(p,'capex')/val(p,'revenue'),minimo:0.01,escala:100,unidad:'pp',limites:[0,1]},
 diasCobro:{tipo:'RATIO',fn:p=>val(p,'receivables')/val(p,'revenue')*365,minimo:5,escala:1,unidad:'días',limites:[0,730]},
 diasInventario:{tipo:'RATIO',fn:p=>val(p,'inventory')/val(p,'revenue')*365,minimo:5,escala:1,unidad:'días',limites:[0,730]},
 diasPago:{tipo:'RATIO',fn:p=>val(p,'payables')/val(p,'revenue')*365,minimo:5,escala:1,unidad:'días',limites:[0,730]}
};
// Referencia sectorial (crecimiento de ingresos y nivel de cada ratio) con datos <= hasta.
const refCache=new Map();
function referencia(plantilla,variable,hasta){const key=plantilla+'|'+variable+'|'+hasta;if(refCache.has(key))return refCache.get(key);const d=VARIABLES[variable],obs=[];
 for(const e of H.empresas){if(e.plantilla!==plantilla)continue;const t=P.tramo(e.ejercicios.filter(p=>p.fy<=hasta).map(p=>({year:p.fy,value:d.fn(p)})));
  if(d.tipo==='CRECIMIENTO'){for(let i=1;i<t.length;i++)if(t[i-1].value>0&&t[i].value>0)obs.push(t[i].value/t[i-1].value-1);}else if(t.length)obs.push(t.at(-1).value);}
 const r=obs.length>=20?P.median(obs):null;refCache.set(key,r);return r;}
const filas=[];
for(const e of H.empresas)for(const T of [2025,2024].filter(x=>!SOLO_T||x===SOLO_T)){
 const real=e.ejercicios.find(p=>p.fy===T);if(!real)continue;
 for(const [nombre,d]of Object.entries(VARIABLES)){
  const objetivo=d.fn(real);if(!Number.isFinite(objetivo)||(d.tipo==='CRECIMIENTO'&&!(objetivo>0)))continue;
  const completo=P.tramo(e.ejercicios.filter(p=>p.fy<T).map(p=>({year:p.fy,value:d.fn(p)})));if(!completo.length||completo.at(-1).year!==T-1)continue;
  for(let h=1;h<=Math.min(3,completo.length);h++){
   const t=completo.slice(-h);if(d.tipo==='CRECIMIENTO'&&t.some(x=>!(x.value>0)))continue;
   const ref=referencia(e.plantilla,nombre,T-1),pred={ultimo:P.simples.ultimo(t),media:P.simples.media(t),cagr:t.every(x=>x.value>0)?P.simples.cagr(t):P.simples.ultimo(t)};
   let analisis;
   if(d.tipo==='CRECIMIENTO'){analisis=P.analizarCrecimiento(t,{referencia:ref});const tr=P.trayectoriaCrecimiento(analisis,{destino:0.025});pred.adaptativo=tr?t.at(-1).value*(1+tr.central[0]):null;}
   else{analisis=P.analizarRatio(t,{minimo:d.minimo});const tr=P.trayectoriaRatio(analisis,{minimo:d.minimo,limites:d.limites,...(PHI?{escenarios:{central:{phi:PHI,desplazamiento:0}}}:{})});pred.adaptativo=tr?tr.central[0]:null;}
   if(pred.adaptativo==null)continue;
   const err=x=>d.tipo==='CRECIMIENTO'?Math.abs(x/objetivo-1)*100:Math.abs(x-objetivo)*d.escala;
   filas.push({id:e.id,plantilla:e.plantilla,pais:e.pais,variable:nombre,T,h,atipico:(analisis.atipicos??[]).length>0,metodo:analisis.estimacion?.metodo??null,errores:Object.fromEntries(Object.entries(pred).map(([k,x])=>[k,err(x)]))});
  }
 }
}
const METODOS=['ultimo','media','cagr','adaptativo'];
function resumen(rows){if(!rows.length)return null;const o={n:rows.length};for(const m of METODOS){const xs=rows.map(r=>r.errores[m]).filter(Number.isFinite).sort((a,b)=>a-b);o[m]={mediana:P.median(xs),media_recortada:xs.slice(Math.floor(xs.length*0.05),Math.ceil(xs.length*0.95)).reduce((a,b)=>a+b,0)/Math.max(1,Math.ceil(xs.length*0.95)-Math.floor(xs.length*0.05))};}
 const mejorSimple=r=>Math.min(r.errores.ultimo,r.errores.media,r.errores.cagr);o.adaptativoGanaAlMejorSimple=rows.filter(r=>r.errores.adaptativo<mejorSimple(r)-1e-12).length/rows.length;o.adaptativoGanaAlUltimo=rows.filter(r=>r.errores.adaptativo<r.errores.ultimo-1e-12).length/rows.length;
 o.mejorMetodoMediana=METODOS.reduce((a,m)=>o[m].mediana<o[a].mediana?m:a,'ultimo');return o;}
const agrupar=(rows,fn)=>{const g={};for(const r of rows)(g[fn(r)]??=[]).push(r);return Object.fromEntries(Object.entries(g).sort().map(([k,v])=>[k,resumen(v)]));};
const informe={version:'G2_BACKTEST_0.1',motor:P.VERSION,fuente:{archivo:path.basename(entrada),medidoEn:H.medidoEn,base:H.base},objetivos:[2025,2024],metodo:'Predicción de T con ejercicios < T; referencia sectorial con ejercicios <= T−1; ingresos en % de error absoluto, ratios en pp o días',
 observaciones:filas.length,porVariable:agrupar(filas,r=>r.variable),porVariableYHistoria:agrupar(filas,r=>r.variable+' | h='+r.h),porPlantilla:agrupar(filas.filter(r=>r.variable==='ingresos'),r=>'plantilla '+r.plantilla),
 ingresosConAtipico:agrupar(filas.filter(r=>r.variable==='ingresos'&&r.h===3),r=>r.atipico?'con posible atípico':'sin atípico'),margenConAtipico:agrupar(filas.filter(r=>r.variable==='margenEbitda'&&r.h===3),r=>r.atipico?'con posible atípico':'sin atípico'),
 porPais:agrupar(filas.filter(r=>r.variable==='ingresos'),r=>r.pais),porAnioObjetivo:agrupar(filas,r=>r.variable+' | T='+r.T)};
fs.writeFileSync(salida,JSON.stringify(informe,null,1));
const linea=(k,o)=>o&&console.log(k.padEnd(34),'n='+String(o.n).padEnd(6),METODOS.map(m=>m+' '+o[m].mediana.toFixed(2)).join(' | '),'| gana al mejor simple '+(o.adaptativoGanaAlMejorSimple*100).toFixed(0)+'%','| mejor:',o.mejorMetodoMediana);
console.log('observaciones',filas.length);for(const[k,o]of Object.entries(informe.porVariableYHistoria))linea(k,o);
