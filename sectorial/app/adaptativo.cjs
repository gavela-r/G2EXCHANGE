// Valoración adaptativa (G2_ADAPTATIVO_0.1): construye, a partir de los históricos acreditados de una empresa, la
// configuración completa que exige workflow.evaluate en modo ADAPTATIVO. No modifica fórmulas de las plantillas: los
// impulsores de ingresos de cada plantilla se fijan para reproducir la senda de ingresos proyectada (representación
// agregada, sin datos operativos), y así se declara. Cada cifra lleva su origen:
//   DATO_CERTIFICADO · DATO_DERIVADO · NO_APLICABLE · ESTIMACION_AUTOMATICA · POLITICA_EXPLICITA · REFERENCIA_MERCADO.
// Nunca se rellena un histórico ausente; si falta un elemento crítico, la empresa queda bloqueada con su causa.
const P=require('./proyeccion.cjs'),{model}=require('./registry.cjs'),{forecastCalendar,day}=require('./calendario.cjs');
const VERSION='G2_ADAPTATIVO_0.1';
// Plantillas con proyección automática. Excluidas con causa: 8/9 (horizonte finito: liquidación y reservas exigen
// hipótesis del analista), 13/14 (expediente prudencial no disponible en la taxonomía), 15 (AFFO/NAV: tasación externa).
const SOPORTADAS=new Set([1,2,3,4,5,6,7,10,11,12,16]);
const EXCLUIDAS={8:'Horizonte finito: valor de liquidación y reservas requieren hipótesis del analista',9:'Horizonte finito: valor de liquidación y reservas requieren hipótesis del analista',13:'Banca: préstamos, depósitos y capital regulatorio no disponibles en la taxonomía acreditada',14:'Seguros: inversiones y pasivos de contratos no disponibles en la taxonomía acreditada',15:'Inmobiliario: AFFO y tasación externa (NAV) requieren datos que no figuran en los estados acreditados'};
// Elementos críticos del último cierre: sin ellos no hay apertura, flujo o puente defendible.
const CRITICOS=['revenue','ebit','da','cash','debt','leaseDebt','equity','assets','liabilities','receivables','payables','inventory','PPE','shares'];
// Secundarias: si no constan por separado (no presentadas o no atestadas) ya están dentro de los totales acreditados y
// quedan en las otras partidas derivadas (origen INCLUIDO_EN_OTRAS_PARTIDAS, impulsor constante); nunca un cero inventado.
const SECUNDARIAS=['contractAssets','contractLiabilities','taxPayable','taxReceivable','deferredTaxAsset','deferredTaxLiability'];
const MONEDA_PAIS={US:'USD',JP:'JPY',TW:'TWD'};
const usable=f=>f?.value!=null&&(f.validation==='VALIDADO'||f.validation==='NO_APLICABLE');
const origen=f=>f?.validation==='NO_APLICABLE'?'NO_APLICABLE':f?.derivation?'DATO_DERIVADO':'DATO_CERTIFICADO';
const civil=n=>new Date(n*86400000).toISOString().slice(0,10);
// Cobertura histórica aplicable: sobre los ejercicios consecutivos disponibles; NO_APLICABLE sale del denominador.
function cobertura(snapshot,m){
 const c={certificados:0,derivados:0,noAplicables:0,ausentes:0,ejercicios:snapshot.periods.length};
 for(const p of snapshot.periods)for(const k of m.requiredHistory){const f=p.fields[k];if(f?.validation==='NO_APLICABLE')c.noAplicables++;else if(f?.validation==='VALIDADO'&&f.value!=null)c[f.derivation?'derivados':'certificados']++;else c.ausentes++;}
 const aplicables=c.certificados+c.derivados+c.ausentes;return{...c,aplicables,porcentaje:aplicables?(c.certificados+c.derivados)/aplicables:0};
}
function serie(periods,fn){return periods.map(p=>({year:p.fiscalYear,value:fn(p.fields)})).filter(x=>Number.isFinite(x.value));}
const v=(f,k)=>usable(f[k])?Number(f[k].value):NaN;
function totalComponentes(p,total,partes){const c=p.componentes??{},t=c[total];if(t?.estado==='V')return t.value;const ps=partes.map(x=>c[x]);if(ps.some(x=>x?.estado==='V')&&ps.every(x=>x?.estado==='V'||x?.estado==='NA'))return ps.reduce((a,x)=>a+(x.estado==='V'?x.value:0),0);if(ps.every(x=>x?.estado==='NA')&&t?.estado==='NA')return 0;return null;}
// Calendario: aniversario observado; con cierres de 52/53 semanas, estimación explícita de 52 semanas (se declara).
function calendario(snapshot,asOf){
 const c=forecastCalendar(snapshot.periods,undefined,asOf);if(c.periods.length===5)return{periods:c.periods,politica:c.policy,estimado:false};
 const last=snapshot.periods.at(-1);let end=day(last.periodEnd);const ends=[];while(ends.length<6){end+=364;if(civil(end)>asOf)ends.push(end);}
 const periods=ends.slice(0,5).map((e,i)=>({start:i?civil(ends[i-1]+1):civil(day(asOf)+1),end:civil(e),fiscalStart:civil(e-363),fiscalEnd:civil(e)}));
 return{periods,politica:'CALENDARIO_ESTIMADO_52_SEMANAS (la semana 53 no se anticipa)',estimado:true,explicito:true};
}
// Impulsores de ingresos que reproducen la senda objetivo R[i] (importe del período, ya ajustado a la fracción anual).
function impulsoresIngresos(id,R,yf){
 const z=()=>[0,0,0,0,0],uno=()=>[1,1,1,1,1],anual=R.map((r,i)=>r/yf[i]);
 switch(id){
  case 1:return{drivers:{bookings:R,recognition:uno()},constants:{backlog:0},nota:'Cartera inicial 0 y reconocimiento del 100 %: contratos nuevos = ingresos proyectados'};
  case 2:{const arr=[],newArr=[],churn=[],start0=anual[0];let start=start0;for(let i=0;i<5;i++){const end=2*anual[i]-start;arr.push(end);const d=end-start;newArr.push(Math.max(0,d));churn.push(d<0?-d/start:0);start=end;}
   if(arr.some(x=>!(x>0))||churn.some(x=>x>1))return null;return{drivers:{churn,expansion:z(),newArr},constants:{arr:start0},nota:'ARR inicial = ingreso anualizado del primer período; ARR nuevo/churn reproducen la senda (ingreso = ARR medio)'};}
  case 3:return{drivers:{capacity:anual,utilization:uno(),asp:uno()},constants:{},nota:'Capacidad expresada en unidades monetarias anuales, utilización 100 % y ASP 1 (sin datos operativos)'};
  case 4:return{drivers:{volume:R,price:uno(),aftermarketPerUnit:z(),retirementRate:z()},constants:{installedBase:0},nota:'Volumen expresado en unidades monetarias y precio 1; posventa sobre base instalada no modelizada (0)'};
  case 5:return{drivers:{vehicleProduction:R,share:uno(),contentPerVehicle:uno(),priceDown:z()},constants:{},nota:'Producción servida expresada en unidades monetarias; cuota y contenido 1; sin reducciones de precio'};
  case 6:{const g=anual.map((x,i)=>i?x/anual[i-1]-1:0);return{drivers:{openings:z(),closures:z(),sameStoreGrowth:g,firstYearRamp:z()},constants:{stores:1,salesPerStore:anual[0]/(1+g[0])},nota:'Una unidad agregada; crecimiento comparable = crecimiento proyectado; sin aperturas ni cierres'};}
  case 7:return null;// se fija por crecimiento (véase abajo)
  case 10:return{drivers:{allowedReturn:z(),regulatoryDepreciation:z(),allowedOpex:z(),eligibleInvestment:z(),unregulatedRevenue:R},constants:{rab:0},nota:'Base regulatoria no modelizada (0); todo el ingreso como no regulado'};
  case 11:return{drivers:{netAdds:z(),arpu:anual.map(x=>x/12)},constants:{subscribers:1},nota:'Un abonado agregado; ARPU mensual = ingreso anual / 12'};
  case 12:return{drivers:{marketedSales:R,pipelineGrossSales:z(),pipelineProbability:z(),rdExpense:z()},constants:{},nota:'Ventas comercializadas = ingresos proyectados; I+D incluida en gastos operativos (opexRate), sin pipeline separado'};
  case 16:return{drivers:{volume:R,price:uno()},constants:{},nota:'Volumen expresado en unidades monetarias y precio 1'};
 }
 return null;
}
// Construye la configuración ADAPTATIVA. refs: referencias de mercado leídas de MySQL por el llamador.
function preparar(snapshot,refs,{asOf=snapshot.asOf}={}){
 const bloqueos=[],traza={version:VERSION,variables:{},hipotesis:[],origenes:{},notas:[]};
 const cl=snapshot.classification,m=model(cl.model);
 if(cl.status!=='RESUELTO'||!m)return{config:null,bloqueos:[{code:'CLASIFICACION_NO_RESUELTA',message:cl.reason}],traza};
 const cov=cobertura(snapshot,m);traza.cobertura=cov;
 if(!SOPORTADAS.has(m.id))return{config:null,bloqueos:[{code:'PLANTILLA_SIN_PROYECCION_AUTOMATICA',message:EXCLUIDAS[m.id]}],traza};
 const ps=snapshot.periods,last=ps.at(-1);
 if(ps.length<2||ps.some((p,i)=>i&&p.fiscalYear!==ps[i-1].fiscalYear+1))return{config:null,bloqueos:[{code:'HISTORIA_INSUFICIENTE_ADAPTATIVA',message:'Se requieren al menos dos ejercicios consecutivos acreditados'}],traza};
 if(last.issues?.length)return{config:null,bloqueos:[{code:'ULTIMO_CIERRE_SIN_ATESTACION',message:'El último informe anual publicado ('+last.periodEnd+') no tiene contexto atestado ('+last.issues.join('; ')+'); requiere la recuperación verificada de ese informe'}],traza};
 if(cov.porcentaje<0.85)bloqueos.push({code:'COBERTURA_APLICABLE_INFERIOR_85',message:'Cobertura histórica aplicable '+(cov.porcentaje*100).toFixed(1)+' %'});
 for(const k of CRITICOS)if(!usable(last.fields[k]))bloqueos.push({code:'DATO_CRITICO_AUSENTE',field:k,message:last.fields[k]?.reason??'No disponible en el último cierre'});
 for(const k of ['revenue','ebit','da'])if(serie(ps,f=>v(f,k)).length<2)bloqueos.push({code:'SERIE_CRITICA_CORTA',field:k,message:'Menos de dos ejercicios acreditados'});
 if(!(v(last.fields,'revenue')>0))bloqueos.push({code:'INGRESOS_NO_POSITIVOS',message:'Sin ingresos positivos no se proyecta por crecimiento'});
 const f=last.fields,nci=usable(f.nci)?Number(f.nci.value):null,sec=k=>usable(f[k])?Number(f[k].value):0;
 if(nci)bloqueos.push({code:'MINORITARIOS_SIN_TRATAMIENTO',message:'Participaciones no dominantes acreditadas: el puente al accionista de la dominante no está implementado'});
 if(usable(f.assets)&&usable(f.liabilities)&&usable(f.equity)&&Math.abs(f.assets.value-f.liabilities.value-f.equity.value)>Math.max(1,Math.abs(f.assets.value)*1e-6))bloqueos.push({code:'BALANCE_NO_CONCILIA',message:'Activo ≠ pasivo + patrimonio de la dominante (minoritarios, patrimonio temporal u otras partidas)'});
 if(last.currency!==MONEDA_PAIS[snapshot.company.codigo_iso])bloqueos.push({code:'MONEDA_DISTINTA_DEL_PAIS',message:'Moneda de presentación '+last.currency+' sin tipo libre de riesgo acreditado en esa moneda'});
 for(const [k,label]of[['rf','tipo libre de riesgo'],['erp','prima de mercado'],['beta','beta sectorial'],['precio','precio de la acción']])if(!(refs[k]?.valor!=null&&Number.isFinite(refs[k].valor)))bloqueos.push({code:'REFERENCIA_MERCADO_AUSENTE',field:k,message:'Sin '+label+' acreditado a la fecha'});
 if(refs.precio?.moneda&&refs.precio.moneda!==last.currency)bloqueos.push({code:'PRECIO_EN_OTRA_MONEDA',message:'Cotización en '+refs.precio.moneda+' (posible ADR sin ratio acreditado)'});
 if(bloqueos.length)return{config:null,bloqueos,traza};
 // --- Análisis por variable (sólo históricos acreditados) ---
 const ref=refs.crecimientoSector?.valor??null,A=(k,fn,o)=>{const a=o.tipo==='CRECIMIENTO'?P.analizarCrecimiento(serie(ps,fn),{referencia:ref}):P.analizarRatio(serie(ps,fn),o);traza.variables[k]=a;return a;};
 const rev=A('ingresos',x=>v(x,'revenue'),{tipo:'CRECIMIENTO'});
 const ebitda=A('margenEbitda',x=>(v(x,'ebit')+v(x,'da'))/v(x,'revenue'),{minimo:0.03});
 const bruto=A('margenBruto',x=>v(x,'grossProfit')/v(x,'revenue'),{minimo:0.03});
 const capexR=A('capexSobreIngresos',x=>v(x,'capex')/v(x,'revenue'),{minimo:0.01});
 const dso=A('diasCobro',x=>v(x,'receivables')/v(x,'revenue')*365,{minimo:5}),dio=A('diasInventario',x=>v(x,'inventory')/v(x,'revenue')*365,{minimo:5}),dpo=A('diasPago',x=>v(x,'payables')/v(x,'revenue')*365,{minimo:5});
 const caR=A('activosContractualesSobreIngresos',x=>v(x,'contractAssets')/v(x,'revenue'),{minimo:0.01}),clR=A('pasivosContractualesSobreIngresos',x=>v(x,'contractLiabilities')/v(x,'revenue'),{minimo:0.01});
 const payout=A('payout',x=>v(x,'netIncome')>0&&Number.isFinite(v(x,'dividends'))?v(x,'dividends')/v(x,'netIncome'):NaN,{minimo:0.05}),taxR=A('tipoEfectivo',x=>v(x,'preTax')>0?v(x,'taxExpense')/v(x,'preTax'):NaN,{minimo:0.03});
 if(rev.estado!=='ESTIMADO'||ebitda.estado!=='ESTIMADO')return{config:null,bloqueos:[{code:'PROYECCION_NO_ESTIMABLE',message:'Ingresos o margen EBITDA sin estimación defendible'}],traza};
 const cal=calendario(snapshot,asOf);traza.calendario={politica:cal.politica,periodos:cal.periods};if(cal.estimado)traza.notas.push('Calendario fiscal estimado (52 semanas): requiere confirmación del analista');
 const yf=cal.periods.map(p=>(day(p.end)-day(p.start)+1)/(day(p.fiscalEnd??p.end)-day(p.fiscalStart??p.start)+1));
 const stubMeses=Math.round((day(asOf)-day(last.periodEnd))/30.44);traza.notas.push('Apertura = último balance auditado publicado ('+last.periodEnd+'); no incorpora los flujos de los '+stubMeses+' meses transcurridos hasta la valoración');
 // --- Hipótesis fiscales, de capital y de política (explícitas) ---
 const tasaLegal=refs.tasaLegal?.valor??null,tax=taxR.estado==='ESTIMADO'&&taxR.estimacion.nivel>0.05&&taxR.estimacion.nivel<0.45?taxR.estimacion.nivel:tasaLegal;
 if(tax==null)return{config:null,bloqueos:[{code:'TIPO_IMPOSITIVO_NO_ESTIMABLE',message:'Sin tipo efectivo histórico razonable ni tipo legal'}],traza};
 const E=refs.precio.valor*Number(f.shares.value),D=Number(f.debt.value),interes=v(f,'interest'),deudaMedia=ps.length>1&&usable(ps.at(-2).fields.debt)?(D+Number(ps.at(-2).fields.debt.value))/2:D;
 const kd=Number.isFinite(interes)&&deudaMedia>0?Math.min(refs.rf.valor+0.06,Math.max(refs.rf.valor,Math.abs(interes)/deudaMedia)):refs.rf.valor+0.015;
 // Arrendamientos: US GAAP operativos = gasto operativo (pasivo y derecho de uso en otras partidas); NIIF 16 = financiación.
 const ifrs=last.norm==='IFRS',arrendFin=totalComponentes(last,'ARREND_FINANCIERO_TOTAL',['ARREND_FINANCIERO_CORRIENTE','ARREND_FINANCIERO_NO_CORRIENTE']),arrendOp=totalComponentes(last,'ARREND_OPERATIVO_TOTAL',['ARREND_OPERATIVO_CORRIENTE','ARREND_OPERATIVO_NO_CORRIENTE']);
 const leaseTotal=Number(f.leaseDebt.value),finIncluidoEnDeuda=/financieros ya figuran/.test(f.leaseDebt.derivation?.rule??'');
 let leaseModelo=leaseTotal,leaseOperativo=0;
 if(!ifrs&&f.leaseDebt.validation==='VALIDADO'){if(arrendOp==null||(!finIncluidoEnDeuda&&arrendFin==null))return{config:null,bloqueos:[{code:'ARRENDAMIENTOS_SIN_DESGLOSE',message:'No se distingue arrendamiento operativo y financiero'}],traza};leaseOperativo=arrendOp;leaseModelo=finIncluidoEnDeuda?0:arrendFin;}
 const L=leaseModelo,wE=E/(E+D+L);
 if(!(wE>0&&wE<=1))return{config:null,bloqueos:[{code:'PESO_PATRIMONIO_FUERA_DE_DOMINIO',message:'Capitalización, deuda o arrendamientos con signo incompatible'}],traza};
 const g=[0.015,0.02,0.025];
 // --- Sendas por escenario ---
 const trR=P.trayectoriaCrecimiento(rev,{destino:0.025}),trM=P.trayectoriaRatio(ebitda,{minimo:0.01,favorable:1,limites:[-0.5,0.9]}),fija=(a,o)=>P.trayectoriaRatio(a,o)??{conservador:Array(5).fill(o.defecto),central:Array(5).fill(o.defecto),optimista:Array(5).fill(o.defecto)};
 const trB=bruto.estado==='ESTIMADO'?P.trayectoriaRatio(bruto,{minimo:0.01,favorable:1,limites:[0,1]}):null,trC=fija(capexR,{minimo:0.005,favorable:-1,limites:[0,1],defecto:null}),trDso=fija(dso,{minimo:3,favorable:-1,limites:[0,730],defecto:null}),trDio=fija(dio,{minimo:3,favorable:-1,limites:[0,730],defecto:null}),trDpo=fija(dpo,{minimo:3,favorable:1,limites:[0,730],defecto:null}),cero={conservador:Array(5).fill(0),central:Array(5).fill(0),optimista:Array(5).fill(0)},trCa=usable(f.contractAssets)?fija(caR,{minimo:0.005,favorable:-1,limites:[0,1],defecto:0}):cero,trCl=usable(f.contractLiabilities)?fija(clR,{minimo:0.005,favorable:1,limites:[0,1],defecto:0}):cero;
 if([trC,trDso,trDio,trDpo].some(t=>t.central.some(x=>x==null)))return{config:null,bloqueos:[{code:'PROYECCION_NO_ESTIMABLE',message:'CapEx o días de circulante sin históricos acreditados'}],traza};
 const nombres=['conservador','central','optimista'],R0=Number(f.revenue.value);
 // Vida remanente implícita del inmovilizado depreciable: (inmovilizado material + intangibles) / D&A del último ejercicio.
 const ppe=Number(f.PPE.value),intang=usable(f.INTANGIBLE)?Number(f.INTANGIBLE.value):0,gw=usable(f.goodwill)?Number(f.goodwill.value):0,rou=ifrs&&usable(f.ROU)?Number(f.ROU.value):0,daU=Number(f.da.value);
 const vida=daU>0?Math.min(40,Math.max(2,(ppe+intang)/daU)):10;traza.hipotesis.push({clave:'vidaRemanente',valor:vida,origen:'ESTIMACION_AUTOMATICA',tecnica:'(inmovilizado material + intangibles) / D&A del último ejercicio, acotada a [2, 40] años'});
 const scenarios=[],revenueDriversNotes=new Set(),constantsSector={};
 const ventas=[],ebitEst=[];
 for(const [s,nombre]of nombres.entries()){
  const gs=trR[nombre],anual=[];let base=R0;for(let i=0;i<5;i++){base*=1+gs[i];anual.push(base);}const R=anual.map((x,i)=>x*yf[i]);ventas.push(R);
  const sc={};let rd=impulsoresIngresos(m.id,R,yf);
  if(m.id===7){sc.volumeGrowth=gs.map((x,i)=>i===0?anual[0]/R0-1:anual[i]/anual[i-1]-1);sc.priceMix=[0,0,0,0,0];revenueDriversNotes.add('Crecimiento de volumen = crecimiento proyectado; efecto precio/mix 0 (no separable sin datos operativos)');}
  else{if(!rd)return{config:null,bloqueos:[{code:'IMPULSORES_NO_REPRESENTABLES',message:'La senda de ingresos no es representable con los impulsores de la plantilla '+m.id}],traza};Object.assign(sc,rd.drivers);Object.assign(constantsSector,rd.constants);revenueDriversNotes.add(rd.nota);}
  // Costes sin D&A = 1 − margen EBITDA, repartidos en coste de ventas y gastos operativos, cada uno en [0, 1] (dominio de la
  // plantilla); con pérdidas operativas el coste total puede superar los ingresos hasta 2×.
  const marg=trM[nombre],cogs=trB?trB[nombre].map((b,i)=>Math.min(1,Math.max(0,1-b),1-marg[i])):marg.map(x=>Math.min(1,1-x));
  for(let i=0;i<5;i++){const total=1-marg[i];if(total-cogs[i]>1)cogs[i]=total-1;}// exceso de gastos operativos sobre 1 → coste de ventas
  sc.cogsRate=cogs;sc.opexRate=marg.map((x,i)=>Math.max(0,1-x-cogs[i]));
  if(cogs.some(x=>x>1+1e-12||x<-1e-12))return{config:null,bloqueos:[{code:'MARGEN_NO_REPRESENTABLE',message:'Costes sin D&A superiores al doble de los ingresos: fuera del dominio de la plantilla'}],traza};
  if(sc.opexRate.some((x,i)=>Math.abs(cogs[i]+x-(1-marg[i]))>1e-9))return{config:null,bloqueos:[{code:'MARGEN_NO_REPRESENTABLE',message:'Margen EBITDA fuera del dominio [0,1] de los costes'}],traza};
  sc.dso=trDso[nombre];sc.dio=trDio[nombre];sc.dpo=trDpo[nombre];
  // El motor calcula saldos contractuales = ingresos DEL PERÍODO × tasa (sin anualizar): en un período parcial la tasa sobre
  // ingresos anuales se divide por la fracción anual para no simular una variación ficticia del saldo.
  sc.contractAssetRate=trCa[nombre].map((x,i)=>x/yf[i]);sc.contractLiabilityRate=trCl[nombre].map((x,i)=>x/yf[i]);
  sc.debtIssue=[0,0,0,0,0];sc.debtRepay=[0,0,0,0,0];sc.equityIssue=[0,0,0,0,0];sc.payout=Array(5).fill(payout.estado==='ESTIMADO'?Math.min(1,Math.max(0,payout.estimacion.nivel)):0);
  sc.leaseRate=Array(5).fill(kd);sc.leasePayment=yf.map(x=>L*kd*x);
  // D&A estimada (lineal sobre neto con vida remanente) para el impuesto operativo y el NOPAT terminal.
  const capex=R.map((r,i)=>r*trC[nombre][i]),da=[];for(let i=0;i<5;i++){let d=(ppe+intang+rou)/vida*yf[i];for(let j=0;j<=i;j++)d+=capex[j]/vida*yf[i];da.push(d);}
  const ebit=R.map((r,i)=>r*marg[i]-da[i]);ebitEst.push(ebit);
  for(let i=0;i<5;i++){const arr=[0,0,0,0,0];arr[i]=capex[i];sc['capex.CAPEX_P'+(i+1)]=arr;}
  sc['tax.adjustments']=[0,0,0,0,0];sc['tax.nolLimit']=[1,1,1,1,1];sc['tax.payable']=Array(5).fill(sec('taxPayable'));sc['tax.receivable']=Array(5).fill(sec('taxReceivable'));sc['tax.dta']=Array(5).fill(sec('deferredTaxAsset'));sc['tax.dtl']=Array(5).fill(sec('deferredTaxLiability'));sc['tax.oci']=[0,0,0,0,0];sc['tax.operatingPaid']=ebit.map(x=>Math.max(0,x)*tax);
  sc.rf=Array(5).fill(refs.rf.valor);sc.beta=Array(5).fill(refs.beta.valor);sc.erp=Array(5).fill(refs.erp.valor);sc.kd=Array(5).fill(kd);sc.weightEquity=Array(5).fill(wE);sc.tax=Array(5).fill(tax);sc.terminalG=Array(5).fill(g[s]);
  const ke=refs.rf.valor+refs.beta.valor*refs.erp.valor,wacc=ke*wE+kd*(1-tax)*(1-wE);
  const nopat6=(R[4]/yf[4])*(1+g[s])*marg[4]*(1-tax)-((ppe+intang+rou)/vida+capex.reduce((a,x)=>a+x,0)/vida)*(1+g[s])*(1-tax);
  const ic=Number(f.equity.value)+D+L-Number(f.cash.value),roicHist=ic>0?ps.map(p=>v(p.fields,'ebit')*(1-tax)/ic).filter(Number.isFinite).at(-1):null;
  const roic=Math.min(0.30,Math.max(wacc+0.01,roicHist??wacc+0.01));
  sc.terminalNOPAT=Array(5).fill(nopat6);sc.terminalROIC=Array(5).fill(roic);
  for(const id of ['OTROS_ACTIVOS','OTROS_PASIVOS']){const o=id==='OTROS_ACTIVOS'?'_A':'_L';sc['ledger.'+id+'.noncashPnl']=[0,0,0,0,0];sc['ledger.'+id+'.oci']=[0,0,0,0,0];sc['ledger.'+id+'.cashIncome']=[0,0,0,0,0];sc['ledger.'+id+'.recognition']=[0,0,0,0,0];}
  scenarios.push(sc);
 }
 // --- Apertura (puente provisional con el último balance auditado) y otras partidas derivadas ---
 const tesoreria=Number(f.cash.value)+(usable(f.marketableSecurities)?Number(f.marketableSecurities.value):0);
 const activosModelo=Number(f.cash.value)+Number(f.inventory.value)+Number(f.receivables.value)+sec('contractAssets')+sec('taxReceivable')+sec('deferredTaxAsset')+ppe+intang+gw+rou;
 const otrosActivos=Number(f.assets.value)-activosModelo,otrosPasivos=Number(f.liabilities.value)-(D+L+Number(f.payables.value)+sec('contractLiabilities')+sec('taxPayable')+sec('deferredTaxLiability'));
 if(otrosActivos<-Math.max(1,Math.abs(f.assets.value)*1e-6)||otrosPasivos<-Math.max(1,Math.abs(f.liabilities.value)*1e-6))return{config:null,bloqueos:[{code:'PERIMETRO_SOLAPADO',message:'La suma de partidas acreditadas supera el total del balance (componentes solapados)'}],traza};
 // Los valores negociables pasan de "otras partidas" a la tesorería del puente (activo financiero no operativo).
 const vneg=tesoreria-Number(f.cash.value),otrosActivosModelo=Math.max(0,otrosActivos-vneg);
 if(vneg>otrosActivos+Math.max(1,Math.abs(f.assets.value)*1e-6))return{config:null,bloqueos:[{code:'PERIMETRO_SOLAPADO',message:'Valores negociables superiores a las otras partidas del activo'}],traza};
 for(const s of scenarios){s['ledger.OTROS_ACTIVOS.stock']=Array(5).fill(otrosActivosModelo);s['ledger.OTROS_PASIVOS.stock']=Array(5).fill(Math.max(0,otrosPasivos));}
 const ref0=last.publication,fuente=k=>(snapshot.company.codigo_iso==='US'?'SEC ':'')+last.provider+' '+last.document+' ('+last.periodEnd+'): '+k;
 const cita=(k,valor,nota)=>({value:valor,source:fuente(k)+(nota?' — '+nota:''),referenceDate:ref0});
 const balances={};for(const k of [...m.requiredHistory.filter(k=>!['revenue','netIncome','ebit','da'].includes(k)),...m.openingExtras]){const fld=f[k];const incluido=SECUNDARIAS.includes(k)&&!usable(fld);balances[k]=cita(k,usable(fld)?Number(fld.value):incluido?0:null,incluido?'no consta por separado: incluido en otras partidas derivadas':fld?.validation==='NO_APLICABLE'?'no presentado en el documento (evidencia NOT_PRESENTED)':fld?.derivation?'derivado: '+fld.derivation.rule:null);traza.origenes['apertura.'+k]=incluido?'INCLUIDO_EN_OTRAS_PARTIDAS':origen(fld);}
 balances.cash=cita('cash',tesoreria,vneg?'efectivo + valores negociables ('+vneg+') como activo financiero no operativo':null);traza.origenes['apertura.cash']=vneg?'DATO_DERIVADO':'DATO_CERTIFICADO';
 balances.leaseDebt=cita('leaseDebt',L,!ifrs?'US GAAP: sólo arrendamientos financieros; los operativos ('+leaseOperativo+') son gasto operativo y su pasivo figura en otras partidas':null);
 balances.shares=cita('shares',Number(f.shares.value),null);
 const assets=[{id:'PPE_APERTURA',clase:'PPE',neto:ppe},...(intang>0?[{id:'INTANGIBLE_APERTURA',clase:'INTANGIBLE',neto:intang}]:[]),...(rou>0?[{id:'ROU_APERTURA',clase:'ROU',neto:rou}]:[])].map(a=>({...a,metodo:'LINEAL',residual:0,vida,tasaDecreciente:null,reservas:null,fechaServicio:last.periodEnd,fechaAdquisicion:last.periodEnd,adicionAnio:null,financiacion:'APERTURA',tipoCapex:'NO_APLICABLE',pagoPendienteApertura:0,source:fuente(a.clase)+' (neto acreditado); vida = estimación automática',referenceDate:ref0}));
 if(gw>0)assets.push({id:'FONDO_COMERCIO',clase:'NO_DEPRECIABLE',metodo:'NINGUNO',neto:gw,residual:0,vida:null,tasaDecreciente:null,reservas:null,fechaServicio:last.periodEnd,fechaAdquisicion:last.periodEnd,adicionAnio:null,financiacion:'APERTURA',tipoCapex:'NO_APLICABLE',pagoPendienteApertura:0,source:fuente('goodwill'),referenceDate:ref0});
 for(let i=0;i<5;i++)assets.push({id:'CAPEX_P'+(i+1),clase:'PPE',metodo:'LINEAL',neto:null,residual:0,vida,tasaDecreciente:null,reservas:null,fechaServicio:cal.periods[i].start,fechaAdquisicion:cal.periods[i].start,adicionAnio:i,financiacion:'CAJA',tipoCapex:'MANTENIMIENTO',pagoPendienteApertura:0,source:'Estimación automática: CapEx = ingresos proyectados × CapEx/ingresos (proyección adaptativa)',referenceDate:asOf});
 const lineas=[{id:'OTROS_ACTIVOS',label:'Otros activos (derivado)',side:'ASSET',opening:otrosActivosModelo,source:fuente('assets')+' − partidas modelizadas acreditadas − valores negociables'},{id:'OTROS_PASIVOS',label:'Otros pasivos (derivado)',side:'LIABILITY',opening:Math.max(0,otrosPasivos),source:fuente('liabilities')+' − partidas modelizadas acreditadas'+(leaseOperativo?' (incluye arrendamientos operativos US GAAP)':'')}].map(l=>({...l,flow:'OPERATING',incomeFlow:'OPERATING',pnl:'OPERATING',valuationRole:'OPERATING',referenceDate:ref0}));
 // Envolver cada escenario con fuente y fecha (cited() en workflow).
 const envolver=sc=>Object.fromEntries(Object.entries(sc).map(([k,vals])=>[k,{values:vals.map(x=>x==null?null:Number(x)),source:'G2 '+VERSION+': '+k,referenceDate:asOf}]));
 const constants=Object.fromEntries(Object.entries({...constantsSector,nol:0,capexPayableOpening:0}).filter(([k])=>m.constants.includes(k)).map(([k,val])=>[k,{value:val,source:k==='nol'?'POLITICA_EXPLICITA: sin pérdidas fiscales acreditadas de apertura (0, criterio conservador)':k==='capexPayableOpening'?'POLITICA_EXPLICITA: crédito de inversión de apertura incluido en otros pasivos derivados':'Representación agregada automática de la plantilla',referenceDate:asOf}]));
 for(const k of ['nol','capexPayableOpening'])traza.hipotesis.push({clave:k,valor:0,origen:'POLITICA_EXPLICITA'});
 traza.hipotesis.push({clave:'deuda',origen:'POLITICA_EXPLICITA',tecnica:'Deuda financiera constante (sin emisiones ni amortizaciones netas)'},{clave:'arrendamientos',origen:'POLITICA_EXPLICITA',tecnica:ifrs?'NIIF 16: pasivo como financiación, ROU como cohorte':'US GAAP: arrendamientos operativos como gasto operativo; sólo los financieros como deuda'},
  {clave:'rf',valor:refs.rf.valor,origen:'REFERENCIA_MERCADO',fuente:refs.rf.fuente,fecha:refs.rf.fecha},{clave:'erp',valor:refs.erp.valor,origen:'REFERENCIA_MERCADO',fuente:refs.erp.fuente,fecha:refs.erp.fecha},{clave:'beta',valor:refs.beta.valor,origen:'REFERENCIA_MERCADO',fuente:refs.beta.fuente},
  {clave:'precio',valor:refs.precio.valor,origen:'REFERENCIA_MERCADO',fuente:refs.precio.fuente,fecha:refs.precio.fecha},{clave:'kd',valor:kd,origen:'ESTIMACION_AUTOMATICA',tecnica:Number.isFinite(interes)&&deudaMedia>0?'Gasto por intereses / deuda media, acotado a [rf, rf + 6 %]':'rf + 1,5 % (sin gasto por intereses acreditado)'},
  {clave:'pesoPatrimonio',valor:wE,origen:'ESTIMACION_AUTOMATICA',tecnica:'Capitalización (precio × acciones) / (capitalización + deuda + arrendamientos del modelo)'},{clave:'tipoImpositivo',valor:tax,origen:taxR.estado==='ESTIMADO'&&tax!==tasaLegal?'ESTIMACION_AUTOMATICA':'REFERENCIA_MERCADO',tecnica:tax!==tasaLegal?'Tipo efectivo histórico (proyección adaptativa)':'Tipo legal del país'},
  {clave:'crecimientoTerminal',valor:g,origen:'POLITICA_EXPLICITA',tecnica:'1,5 % / 2,0 % / 2,5 % por escenario (crecimiento nominal de largo plazo, no superior al tipo libre de riesgo)'},{clave:'roicTerminal',origen:'ESTIMACION_AUTOMATICA',tecnica:'ROIC histórico del último ejercicio acotado a [WACC + 1 %, 30 %]'});
 traza.notas.push(...revenueDriversNotes);traza.escenarios={nombres,crecimiento:trR,margenEbitda:trM,ventas,ebitEstimado:ebitEst};
 const config={modo:'ADAPTATIVO',companyId:snapshot.company.id,inputHash:snapshot.inputHash,calendar:cal.explicito?cal.periods:undefined,scenarios:scenarios.map(envolver),constants,assets,
  accountingPolicy:{source:'Perímetro derivado de los totales acreditados del último cierre (otras partidas = total − partidas modelizadas)',referenceDate:ref0,reviewer:'SIN_REVISAR (automático)',scope:'PERIMETRO_COMPLETO',lines:lineas},
  valuationBridge:{asOf,currency:last.currency,basis:last.basis,norm:last.norm,source:'PUENTE_PROVISIONAL: último balance anual auditado publicado ('+last.document+', '+last.periodEnd+'); flujos del período transcurrido no incorporados',reviewer:'SIN_REVISAR (automático)',balances},
  terminalSource:'Continuidad con crecimiento terminal '+g.map(x=>(x*100).toFixed(1)+' %').join(' / ')+' y ROIC incremental acotado (estimación automática)',workingCapitalDays:'SOBRE_VENTAS',trazabilidad:traza};
 if(!config.calendar)delete config.calendar;
 return{config,bloqueos:[],traza};
}
// Referencias de mercado leídas de MySQL (consulta de solo lectura; la conexión la aporta el llamador).
// Sector MySQL representativo de cada plantilla (beta de referencia cuando la empresa figura en el sector «N/A»).
const SECTOR_PLANTILLA={1:25,2:14,3:19,4:20,5:9,6:15,7:181,8:6,9:10,10:4,11:62,12:137,13:16,14:12,15:26,16:221};
function crecimientoSectorial(hist,plantilla,hasta){
 if(!hist)return null;const g=[];for(const e of hist.empresas){if(e.plantilla!==plantilla)continue;const t=P.tramo(e.ejercicios.filter(p=>p.fy<=hasta).map(p=>({year:p.fy,value:p.campos.revenue?.v==null?NaN:Number(p.campos.revenue.v)})));for(let i=1;i<t.length;i++)if(t[i-1].value>0&&t[i].value>0)g.push(t[i].value/t[i-1].value-1);}
 return g.length>=20?{valor:P.median(g),fuente:'Mediana de variaciones interanuales de ingresos acreditados de '+g.length+' observaciones de la plantilla '+plantilla+' hasta '+hasta}:null;
}
async function referencias(db,snapshot,asOf,hist){
 const c=snapshot.company,[[pais]]=await db.query('SELECT interes_bono_10_ano rf,fecha_publicacion_bono10 rfFecha,prima_riesgo_mercado erp,fecha_actualizacion_prima_mercado erpFecha,fuente_prima_mercado erpFuente,tasa_impositiva tasa FROM pais WHERE codigo_iso=?',[c.codigo_iso]);
 const sectorBeta=c.sector_id&&c.sector_id!==221?c.sector_id:SECTOR_PLANTILLA[snapshot.classification.model],[[sec]]=await db.query('SELECT id,nombre_sector,sensibilidad_al_mercado beta FROM sector WHERE id=?',[sectorBeta]);
 const[precios]=await db.query('SELECT q.precio_cierre precio,q.fecha,i.moneda,i.ticker FROM cotizacion_diaria q JOIN instrumento i ON i.id=q.instrumento_id WHERE i.empresa_id=? AND q.fecha<=? AND q.precio_cierre>0 ORDER BY q.fecha DESC LIMIT 2',[c.id,asOf]);
 const ok=(x,f)=>x!=null&&(!f||f<=asOf);
 return{rf:ok(pais?.rf,pais?.rfFecha)?{valor:Number(pais.rf)/100,fecha:pais.rfFecha,fuente:'pais.interes_bono_10_ano ('+c.codigo_iso+')'}:null,
  erp:ok(pais?.erp,pais?.erpFecha)?{valor:Number(pais.erp)/100,fecha:pais.erpFecha,fuente:pais.erpFuente}:null,tasaLegal:pais?.tasa!=null?{valor:Number(pais.tasa)/100}:null,
  beta:sec?.beta!=null?{valor:Number(sec.beta),fuente:'sector.sensibilidad_al_mercado: '+sec.nombre_sector+' (beta sectorial de referencia, no específica de la empresa)'}:null,
  precio:precios.length===1||(precios.length>1&&precios[0].fecha!==precios[1].fecha)?{valor:Number(precios[0].precio),fecha:precios[0].fecha,moneda:precios[0].moneda,fuente:'cotizacion_diaria '+precios[0].ticker}:null,
  crecimientoSector:crecimientoSectorial(hist,snapshot.classification.model,snapshot.periods.at(-1)?.fiscalYear??0)};
}
module.exports={VERSION,SOPORTADAS,EXCLUIDAS,CRITICOS,SECUNDARIAS,cobertura,preparar,impulsoresIngresos,calendario,referencias,crecimientoSectorial};
