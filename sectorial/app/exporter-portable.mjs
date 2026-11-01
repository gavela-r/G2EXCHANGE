// Exportador portable (SheetJS, Apache-2.0) para entornos sin @oai/artifact-tool (dependencia privada no redistribuible).
// Escribe las mismas celdas y fórmulas del grafo que el exportador principal (S_* en idénticas posiciones) y un resumen
// en 'Proyeciones INDITEX' con las direcciones que verifica native-qa (M199 = valor por acción). No reproduce la
// presentación Inditex. La descarga sigue exigiendo la validación nativa en Microsoft Excel (native-qa.cjs).
import fs from'node:fs/promises';import path from'node:path';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),{project}=require('./env.cjs'),XLSX=createRequire(path.join(project,'server/package.json'))('xlsx'),{letra}=require('./engine/dist/grafo.js');
const SUMMARY=[[78,'revenue','Ingresos'],[83,'ebitda','EBITDA'],[88,'ebit','EBIT'],[98,'netIncome','Resultado neto'],[105,'fixedAssets','Activos no corrientes'],[112,'assets','Total activo'],[114,'equity','Patrimonio'],[121,'balanceDifference','Diferencia de balance'],[137,'cfo','CFO'],[139,'capex','CapEx pagado'],[152,'cash','Tesorería'],[180,'valuationFlow','Flujo valorado'],[188,'valuationRate','Tasa de descuento'],[189,'valuationPV','Valor presente']];
const safe=x=>typeof x==='string'&&/^[=+@-]/.test(x)?"'"+x:x;
function put(ws,address,cell){ws[address]=cell;const c=XLSX.utils.decode_cell(address),r=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):{s:{r:c.r,c:c.c},e:{r:c.r,c:c.c}};r.s.r=Math.min(r.s.r,c.r);r.s.c=Math.min(r.s.c,c.c);r.e.r=Math.max(r.e.r,c.r);r.e.c=Math.max(r.e.c,c.c);ws['!ref']=XLSX.utils.encode_range(r);}
const value=(v,z)=>v==null?{t:'z'}:typeof v==='number'?{t:'n',v,...(z?{z}:{})}:{t:'s',v:safe(String(v))};
const formula=(f,cached,z)=>({t:typeof cached==='number'?'n':'s',f:f.replace(/^=/,''),v:cached??'RECALCULANDO',...(z?{z}:{})});
const FORMAT={tasa:'0.00%',importe:'#,##0.00;(#,##0.00)',fecha:'dd/mm/yyyy'};
export async function exportWorkbookPortable(run,evaluated,file){
 const{result,plan,entry}=evaluated,wb=XLSX.utils.book_new(),sheets=new Map(),sheet=name=>{if(!sheets.has(name)){const ws={};sheets.set(name,ws);}return sheets.get(name);};
 const main=sheet('Proyeciones INDITEX'),label=result.source==='EMPRESA_MYSQL'?'EMPRESA REAL':'PRUEBA SINTÉTICA QA — NO ES UNA EMPRESA';
 put(main,'B1',value('G2EXCHANGE — '+run.snapshot.company.nombre_empresa+' — '+result.status));put(main,'B2',value(label+' · exportador portable sin formato Inditex · revisión financiera pendiente'));
 if(plan){
  const g=plan.grafo,cached=g.evaluar({'control.case':2});
  for(const n of g.nodos){const ws=sheet(n.hoja),a=letra(n.columna)+n.fila;put(ws,'A'+n.fila,value(n.etiqueta));put(ws,a,n.expr===undefined?value(n.valor??null,FORMAT[n.unidad]):formula(g.formula(n),cached.get(n.id),FORMAT[n.unidad]));}
  for(const[name,ws]of sheets)if(name!=='Proyeciones INDITEX'){put(ws,'A1',value(name.replace('S_','')+' — '+run.snapshot.company.nombre_empresa));put(ws,'A2',value(label+' · '+entry.moneda+' · '+entry.norma+' · '+result.status));result.calendar.periods.forEach((p,i)=>put(ws,letra(13+i)+'4',value(p.end)));}
  const out=(k,i)=>plan.salida[k]?.[i],f=e=>typeof e==='number'?String(e):g.formula({expr:e}),cv=e=>typeof e==='number'?e:cached.get(e.ref);
  for(const[r,k,l]of SUMMARY){put(main,'B'+r,value(l));for(let i=0;i<5;i++){const e=out(k,i);if(e!==undefined)put(main,letra(13+i)+r,formula(f(e),cv(e),k==='valuationRate'?'0.00%':FORMAT.importe));}}
  for(const[r,k,l]of[[192,'explicitPV','VP flujos explícitos'],[193,'terminalPV','VP valor terminal'],[194,'enterprise',result.model.family==='FCFF'?'Valor de empresa':'Equity descontado'],[202,'equityValue','Valor del patrimonio']]){put(main,'B'+r,value(l));const e=out(k,0);if(e!==undefined)put(main,'L'+r,formula(f(e),cv(e),FORMAT.importe));}
  put(main,'B199',value('Valor por acción ('+entry.moneda+') · revisión pendiente'));const p=out('price',0);put(main,'M199',p===undefined?value('NO_ESTIMABLE'):formula(f(p),cv(p),FORMAT.importe));
  const control=sheet('S_Control');put(control,'A9',value('Estado del expediente: '+result.status+'. Cambiar hipótesis en Excel es una simulación manual; no acredita fuentes ni actualiza MySQL.'));
 }else put(main,'B4',value('BLOQUEADO · Sin modelo/calendario acreditado. No se presenta valoración ni proyecciones artificiales.'));
 // Valoración provisional y trazabilidad de la proyección adaptativa (sólo si la ejecución la incluye).
 if(result.provisional)put(main,'B3',value('VALORACIÓN PROVISIONAL — '+result.provisionalReason));
 const tz=run.configuration?.trazabilidad;
 if(tz){const ws=sheet('S_Proyeccion'),rows=[['G2 '+tz.version+' — origen y técnica de cada proyección (las proyecciones no son hechos)'],['Cobertura histórica aplicable',tz.cobertura?((tz.cobertura.porcentaje*100).toFixed(1)+' %'):'',JSON.stringify(tz.cobertura??{})],['Calendario',tz.calendario?.politica??''],[],['Variable','Técnica','Estimación','Confianza','Ejercicios','Pesos (0 = posible atípico)','Atípicos','Patrón','Sin ajustar','Motivo']];
  for(const[k,a]of Object.entries(tz.variables??{}))rows.push([k,a.estimacion?.metodo??a.estado,a.estimacion?.g0??a.estimacion?.nivel??null,a.estimacion?.confianza??'',(a.ejercicios??[]).join(', '),JSON.stringify(a.pesos??{}),(a.atipicos??[]).map(x=>x.year+' '+x.tipo).join('; '),a.patron??'',a.sinAjustar?.g0??a.sinAjustar?.nivel??null,a.estimacion?.motivo??(a.advertencias??[]).join('; ')]);
  rows.push([],['Hipótesis','Valor','Origen','Técnica / fuente']);for(const h of tz.hipotesis??[])rows.push([h.clave,Array.isArray(h.valor)?h.valor.join(' / '):h.valor??'',h.origen,h.tecnica??((h.fuente??'')+(h.fecha?' ('+h.fecha+')':''))]);
  rows.push([],['Origen de la apertura']);for(const[k,o]of Object.entries(tz.origenes??{}))rows.push([k,o]);
  rows.push([],['Notas']);for(const n of tz.notas??[])rows.push([n]);
  if(tz.escenarios){rows.push([],['Senda por escenario','Año 1','Año 2','Año 3','Año 4','Año 5']);for(const[i,n]of tz.escenarios.nombres.entries()){rows.push(['Crecimiento de ingresos — '+n,...tz.escenarios.crecimiento[n]]);rows.push(['Margen EBITDA — '+n,...tz.escenarios.margenEbitda[n]]);}}
  rows.forEach((row,i)=>row.forEach((v,j)=>put(ws,letra(1+j)+(1+i),value(v===undefined?null:v))));}
 const hist=sheet('S_Historico'),trace=[['Ejercicio','Concepto','Estado','Importe admitido','Importe original','Moneda','Unidad','Escala','Norma','Perímetro','Informe','Registro','Verificación','Documento','Publicación','Motivo']];
 for(const p of run.snapshot.periods)for(const o of p.observations)trace.push([p.periodEnd,o.code??o.concept,o.validation,o.value,o.rawValue,o.currency,o.unit,o.scale,o.norm,o.basis,p.reportId,o.recordId,o.verificationId??null,p.document,p.publication,o.reason]);
 trace.forEach((row,i)=>row.forEach((v,j)=>put(hist,letra(21+j)+(4+i),value(v))));
 const status=sheet(plan?'S_Control':'Proyeciones INDITEX'),notes=[['Bloqueo','Concepto','Período','Motivo'],...[...result.issues,...(result.notices??[]).map(n=>({...n,code:'AVISO_'+n.code}))].map(x=>[x.code,x.field??'',x.period??'',x.message??JSON.stringify(x)])];
 if(notes.length>1)notes.forEach((row,i)=>row.forEach((v,j)=>put(status,letra(1+j)+(32+i),value(v))));
 for(const[name,ws]of sheets){ws['!cols']=[{wch:60},...Array(7).fill({wch:2}),...Array(30).fill({wch:15})];XLSX.utils.book_append_sheet(wb,ws,name);}
 wb.Workbook={...(wb.Workbook??{}),CalcPr:{fullCalcOnLoad:'1'}};
 await fs.writeFile(file,XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true}));
 const evidence={runId:run.id,engineHash:run.engineHash,company:run.snapshot.company.id,model:result.model?.id??null,status:result.status,exporter:'PORTABLE_SHEETJS',presentation:'SIN_FORMATO_INDITEX',output:file,at:new Date().toISOString()};
 await fs.writeFile(file+'.qa.json',JSON.stringify(evidence,null,2));return{evidence};
}
