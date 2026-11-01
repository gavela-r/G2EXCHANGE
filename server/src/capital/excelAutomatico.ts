import * as XLSX from 'xlsx';

/** Sólo modifica el libro NUEVO exportado; nunca el fichero maestro ni el run. */
export function integrarPrimasExcel(book:XLSX.WorkBook,payload:any){
 if(!payload.primasAutomaticas)return;
 const scenarios=payload.escenarios??[],source=payload.fuenteCongelada;
 const labels:Record<number,string>={1:'G2EXCHANGE · PRIMAS AUTOMÁTICAS',2:'Empresa',3:'Fecha de valoración',4:'Modo',5:'0 operativo NO_ESTIMABLE no estima el riesgo',7:'Concepto',8:'Ke base',9:'Kd base',10:'Peso patrimonio',11:'Peso deuda',12:'Tipo fiscal',13:'WACC base financiero',14:'PRIMA DE LIQUIDEZ · operativa',15:'Estado financiero liquidez',16:'Prima liquidez calculada',17:'Componente liquidez',18:'Motivo liquidez',19:'PRIMA DE TAMAÑO · operativa',20:'Estado financiero tamaño',21:'Prima tamaño calculada',22:'Componente tamaño',23:'Motivo tamaño',24:'Ajuste Ke autorizado',25:'Ajuste Kd autorizado',26:'Ke ajustado',27:'Kd ajustado',28:'Hipótesis manual Ke · pb',29:'Hipótesis manual Kd · pb',30:'WACC ajustado',31:'Aplicabilidad WACC',33:'Tasa DCF original',34:'Tasa DCF ajustada',35:'Crecimiento perpetuo',36:'FCFF año 1 · millones',37:'FCFF año 2 · millones',38:'FCFF año 3 · millones',39:'FCFF año 4 · millones',40:'FCFF año 5 · millones',41:'PV FCFF originales · millones',42:'EV original · millones',43:'Numerador terminal congelado · millones',44:'EV ajustado · millones',45:'Equity original · millones',46:'Equity ajustado · millones',47:'Acciones usadas en run · millones',48:'Valor intrínseco original / acción',49:'Valor intrínseco ajustado / acción',50:'Diferencia absoluta / acción',51:'Diferencia porcentual',52:'Fuente de coeficientes',53:'Estado de aplicación',54:'Fórmula de prima',55:'Alcance'};
 const ws:XLSX.WorkSheet={};
 const set=(a:string,v:any,f?:string)=>{ws[a]={t:typeof v==='number'?'n':'s',v:v??'NO_ESTIMABLE',...(f?{f}:{})};};
 for(const [row,label]of Object.entries(labels))set('A'+row,label);
 set('B2',payload.empresaNombre??payload.empresa?.nombre_empresa);set('B3',payload.fechaValoracion??payload.fecha);
 set('B4',scenarios.length?'AUTOMÁTICO · SIMULACIÓN INDEPENDIENTE':'AUTOMÁTICO · DIAGNÓSTICO SIN RUN');set('B55','Sin calibración no hay prima estimada. Las fórmulas de descuento mantienen flujos y numerador terminal del run; no reproyectan el negocio. Las hojas legadas 08/09 conservan su lógica original y no son el resultado nuevo.');
 const width=scenarios.length||1;
 const liquidity:any[]=[],size:any[]=[],sources:any[]=[],applications:any[]=[],formulas:any[]=[];
 for(let index=0;index<width;index++){
  const s=scenarios[index],c='BCD'[index],p=s?.primasAutomaticas??payload.primasAutomaticas;
  const l=p.primas.find((x:any)=>x.factor==='LIQUIDEZ_BURSATIL'),z=p.primas.find((x:any)=>x.factor==='TAMANO_RESIDUAL');
  if(!l||!z)throw Error('Se requieren los dos resultados de prima, incluidos los no estimables');
  set(c+'7',s?.escenario??'DIAGNÓSTICO');
  for(const [row,prime]of [[14,l],[19,z]] as const){set(c+row,prime.ajusteOperativo);set(c+(row+1),prime.estadoFinanciero);set(c+(row+2),prime.primaCalculada??'NO_ESTIMABLE');set(c+(row+3),prime.componente);}
  liquidity.push(l.motivo);size.push(z.motivo);sources.push(...[l,z].map(x=>x.fuenteCoeficientes??'SIN COEFICIENTES AUTORIZADOS'));applications.push(`${s?.escenario??'DIAGNÓSTICO'}: liquidez ${l.estadoAplicacion}; tamaño ${z.estadoAplicacion}`);formulas.push(...[l,z].map(x=>x.formula??'No se estima una prima; ajuste operativo = 0'));
  if(!s){for(const row of [8,9,10,11,12,13,26,27,30,31,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51])set(c+row,'NO_ESTIMABLE');set(c+'24',0);set(c+'25',0);continue;}
  for(const [row,value]of [[8,s.keBase],[9,s.kdBase],[10,s.pesoPatrimonio],[11,s.pesoDeuda],[12,s.impuesto],[28,s.hipotesis?.keBps??0],[29,s.hipotesis?.kdBps??0]] as const)set(c+row,value);
  set(c+'13',s.waccBase,`${c}8*${c}10+${c}9*(1-${c}12)*${c}11`);
  set(c+'24',(l.componente==='KE'?l.ajusteOperativo:0)+(z.componente==='KE'?z.ajusteOperativo:0),`IF(${c}17="KE",${c}14,0)+IF(${c}22="KE",${c}19,0)`);
  set(c+'25',(l.componente==='KD'?l.ajusteOperativo:0)+(z.componente==='KD'?z.ajusteOperativo:0),`IF(${c}17="KD",${c}14,0)+IF(${c}22="KD",${c}19,0)`);
  set(c+'26',s.keAjustado,`${c}8+${c}24+${c}28/10000`);set(c+'27',s.kdAjustado,`${c}9+${c}25+${c}29/10000`);
  set(c+'30',s.waccAplicable?s.waccAjustado:'NO_APLICABLE',s.waccAplicable?`${c}26*${c}10+${c}27*(1-${c}12)*${c}11`:undefined);
  set(c+'31',s.waccAplicable?'FCFF · WACC':'MODELO EQUITY · Ke');
  const original=s.impacto?.original,adjusted=s.impacto?.ajustado,w=source?.output?.wacc_scenarios.find((x:any)=>x.escenario===s.escenario),input=source?.input;
  if(!original||!adjusted||!input||!w){for(const row of [33,34,35,41,42,43,44,45,46,47,48,49,50,51])set(c+row,'NO_ESTIMABLE');continue;}
  const rate0=s.waccAplicable?original.wacc:w.ke+w.prima_total;
  set(c+'33',rate0);set(c+'34',s.waccAplicable?s.waccAjustado:s.keAjustado,`${c}${s.waccAplicable?30:26}`);set(c+'35',original.terminal_growth);
  set(c+'48',original.fair_value);
  if(s.waccAplicable){
   const flows=original.proyeccion_fcff,mid=(input.valuation_timing?.discount_convention??input.discount_convention)==='MID_YEAR';
   if(!Array.isArray(flows)||flows.length!==5)throw Error('No hay cinco flujos congelados para Excel');
   flows.forEach((v:number,n:number)=>set(c+(36+n),v));
   const pv=(rate:string)=>flows.map((_v:number,n:number)=>`${c}${36+n}/(1+${rate})^${n+1-(mid?.5:0)}`).join('+');
   const pv0=flows.reduce((a:number,f:number,n:number)=>a+f/(1+rate0)**(n+1-(mid?.5:0)),0);
   set(c+'41',pv0,pv(c+'33'));set(c+'42',original.valor_empresa_millones);
   set(c+'43',(original.valor_empresa_millones-pv0)*(1+rate0)**5*(rate0-original.terminal_growth),`(${c}42-${c}41)*(1+${c}33)^5*(${c}33-${c}35)`);
   set(c+'44',adjusted.valor_empresa_millones,`IF(${c}34<=${c}35,"NO_ESTIMABLE",IF(${c}34=${c}33,${c}42,${pv(c+'34')}+${c}43/(${c}34-${c}35)/(1+${c}34)^5))`);
   set(c+'45',original.valor_patrimonio_millones);set(c+'46',adjusted.valor_patrimonio_millones,`${c}45+${c}44-${c}42`);
   set(c+'47',w.equity_market_value_millions/input.price_per_share);
   set(c+'49',adjusted.fair_value,`IF(${c}34<=${c}35,"NO_ESTIMABLE",IF(${c}34=${c}33,${c}48,MAX(0,${c}46)/${c}47))`);
  }else{
   for(const row of [36,37,38,39,40,41,42,43,44,47])set(c+row,'NO_APLICABLE');
   set(c+'45',original.valor_patrimonio_millones);
   set(c+'46',adjusted.valor_patrimonio_millones,`IF(${c}34<=${c}35,"NO_ESTIMABLE",${c}45*(${c}33-${c}35)/(${c}34-${c}35))`);
   set(c+'49',adjusted.fair_value,`IF(${c}34<=${c}35,"NO_ESTIMABLE",IF(${c}34=${c}33,${c}48,${c}48*(${c}33-${c}35)/(${c}34-${c}35)))`);
  }
  set(c+'50',s.impacto.diferenciaAbsoluta,`${c}49-${c}48`);set(c+'51',s.impacto.diferenciaPorcentual??'NO_ESTIMABLE',`IF(${c}48=0,"NO_ESTIMABLE",${c}49/${c}48-1)`);
 }
 for(const [row,texts]of [[18,liquidity],[23,size],[52,sources],[53,applications],[54,formulas]] as const)set('B'+row,[...new Set(texts)].join('\n'));
 ws['!ref']='A1:D55';ws['!cols']=[{wch:48},{wch:26},{wch:26},{wch:26}];
 ws['!merges']=[1,2,3,4,5,18,23,52,53,54,55].map(r=>({s:{r:r-1,c:r===1||r===5?0:1},e:{r:r-1,c:3}}));
 ws['!rows']=Array.from({length:55},(_,n)=>({hpt:[18,23,52,53,54,55].includes(n+1)?70:22}));
 for(const [addr,cell]of Object.entries(ws)){if(addr.startsWith('!'))continue;const n=Number(addr.slice(1));(cell as any).s={alignment:{vertical:'top',wrapText:true},font:{name:'Calibri',sz:11,color:{rgb:addr.startsWith('A')?'173F50':'172F3A'}},...([1,7].includes(n)?{fill:{fgColor:{rgb:'173F50'}},font:{color:{rgb:'FFFFFF'},bold:true}}:{})};
  if(!addr.startsWith('A')&&cell.t==='n')cell.z=[8,9,10,11,12,13,14,16,19,21,24,25,26,27,30,33,34,35,51].includes(n)?'0.0000%;(0.0000%);0.0000%':'#,##0.0000;(#,##0.0000);0.0000';
 }
 XLSX.utils.book_append_sheet(book,ws,'Primas_auto');book.SheetNames=['Primas_auto',...book.SheetNames.filter(n=>n!=='Primas_auto')];
 if(!scenarios.length)return;
 const wa=book.Sheets['07_WACC'];
 if(!wa)throw Error('Modelo sectorial sin hoja 07_WACC');
 const put=(sheet:XLSX.WorkSheet,addr:string,value:any,formula?:string)=>{const cell=sheet[addr]??{};sheet[addr]={...cell,t:typeof value==='number'?'n':'s',v:value??'NO_ESTIMABLE',...(formula?{f:formula}:{})};if(!formula)delete sheet[addr].f;};
 scenarios.forEach((s:any,n:number)=>{const c='BCD'[n],col=['H','J','L'][n],status=['I','K','M'][n],ps=s.primasAutomaticas.primas;
  for(const [row,target,value]of [[20,26,s.keAjustado],[24,27,s.kdAjustado],[29,13,s.waccBase],[30,14,ps[0].ajusteOperativo],[31,19,ps[1].ajusteOperativo],[35,30,s.waccAplicable?s.waccAjustado:'NO_APLICABLE']] as const)put(wa,col+row,value,`'Primas_auto'!${c}${target}`);
  put(wa,status+'30',ps[0].estadoFinanciero);put(wa,status+'31',ps[1].estadoFinanciero);
  put(wa,col+'32',0);put(wa,status+'32','EXCLUIDA');put(wa,col+'33',0);
  put(wa,col+'34',s.waccAplicable?s.deltaWacc:'NO_APLICABLE',s.waccAplicable?`'Primas_auto'!${c}30-'Primas_auto'!${c}13`:undefined);
  const result=book.Sheets['10_RESULTADO'];if(result){put(result,c+'4',s.impacto.ajustado?.fair_value,`'Primas_auto'!${c}49`);put(result,c+'6',s.impacto.ajustado?.max_buy_price);put(result,c+'8',s.impacto.ajustado?.upside);put(result,c+'9',s.impacto.ajustado?.decision);}
 });
 put(wa,'F20','Ke ajustado');put(wa,'F30','PRIMA DE LIQUIDEZ');put(wa,'F31','PRIMA DE TAMAÑO');put(wa,'F34','Impacto ponderado sobre WACC');put(wa,'F39','Estados y evidencia: Primas_auto');
 wa['!cols']=wa['!cols']??[];for(const index of [8,10,12])wa['!cols'][index]={...(wa['!cols'][index]??{}),wch:21};
 const base=scenarios.find((s:any)=>s.escenario==='BASE')??scenarios[0],c='BCD'[scenarios.indexOf(base)];
 put(wa,'B19',base.primasAutomaticas.primas[1].ajusteOperativo,`'Primas_auto'!${c}19`);put(wa,'B20',base.keAjustado,`'Primas_auto'!${c}26`);put(wa,'B21',base.kdAjustado,`'Primas_auto'!${c}27`);put(wa,'B27',base.waccAplicable?base.waccAjustado:'NO_APLICABLE',`'Primas_auto'!${c}30`);
 const api=book.Sheets['11_OUTPUT_API'];if(api)for(const addr of Object.keys(api).filter(a=>/^A\d+$/.test(a))){const key=String(api[addr].v);for(const s of scenarios){const suffix=s.escenario.toLowerCase(),l=s.primasAutomaticas.primas[0],z=s.primasAutomaticas.primas[1],values:Record<string,any>={['fair_value_'+suffix]:s.impacto.ajustado?.fair_value,['wacc_'+suffix]:s.waccAplicable?s.waccAjustado:'NO_APLICABLE',['wacc_ajustado_'+suffix]:s.waccAplicable?s.waccAjustado:'NO_APLICABLE',['wacc_financiero_'+suffix]:s.waccBase,['liquidez_'+suffix]:l.ajusteOperativo,['tamano_'+suffix]:z.ajusteOperativo,['concentracion_clientes_'+suffix]:0};if(key in values)put(api,'B'+addr.slice(1),values[key]);}}
 const audit=book.Sheets['14_MOTOR_TS'];if(audit)put(audit,'A1','MOTOR HISTÓRICO: referencia congelada. Resultado nuevo en Primas_auto y 10_RESULTADO.');
 book.Workbook=book.Workbook??{};(book.Workbook as any).CalcPr={calcMode:'auto',fullCalcOnLoad:true};
}
