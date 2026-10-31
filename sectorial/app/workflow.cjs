const {model}=require('./registry.cjs'),{hash,date}=require('./adapter.cjs'),{forecastCalendar,day}=require('./calendario.cjs'),{crearPlan}=require('./engine/dist/plan.js');
const capital=require('./vendor/capital/server/src/capital/finanzas.js'),premiums=require('./vendor/capital/server/src/capital/primas.js');
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
function cited(item,asOf,label,array=false){
 if(item===undefined)return array?Array(5).fill(null):null;
 if(!item||typeof item!=='object'||typeof item.source!=='string'||!item.source.trim()||!item.referenceDate)throw Error('Fuente/fecha obligatorias: '+label);date(item.referenceDate);if(item.referenceDate>asOf)throw Error('Hipótesis futura: '+label);
 const v=array?item.values:item.value;if(array&&(!Array.isArray(v)||v.length!==5))throw Error('Cinco hipótesis anuales requeridas: '+label);
 if((array?v:[v]).some(x=>x!==null&&(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>Number.MAX_SAFE_INTEGER)))throw Error('Valor no numérico o fuera de precisión: '+label);
 return v;
}
// Sólo cuando la clasificación acreditada NO está resuelta; nunca sustituye una resuelta.
function declaredClassification(snapshot,item){
 if(item===undefined||item===null)return null;
 if(snapshot.classification.status==='RESUELTO')throw Error('La clasificación acreditada está resuelta; no se sustituye por una declaración');
 if(typeof item!=='object'||!Number.isInteger(item.model)||item.model<1||item.model>16||!String(item.source??'').trim()||!String(item.reviewer??'').trim()||!String(item.reason??'').trim()||!item.referenceDate)throw Error('Clasificación declarada sin modelo, fuente, motivo o responsable');
 date(item.referenceDate);if(item.referenceDate>snapshot.asOf)throw Error('Clasificación declarada con fuente posterior a la valoración');
 return{model:item.model,source:item.source,reviewer:item.reviewer,reason:item.reason,referenceDate:item.referenceDate};
}
// Metodología G2 por defecto: días de cobro, inventario y pago sobre VENTAS. La convencional debe declararse.
function workingCapitalDays(config){const x=config.workingCapitalDays??'SOBRE_VENTAS';if(!['SOBRE_VENTAS','CONVENCIONAL'].includes(x))throw Error('Metodología de días de circulante desconocida');return x;}
function buildEntry(snapshot,config={}){
 const issues=[...snapshot.issues.map(x=>({...x,kind:'DATOS'}))],notices=[],declared=declaredClassification(snapshot,config.classification);
 if(declared)notices.push({code:'CLASIFICACION_DECLARADA_POR_ANALISTA',model:declared.model,message:'La clasificación acreditada no estaba resuelta; se aplica el modelo declarado con fuente y responsable. Requiere revisión.'});
 const m=model(declared?.model??snapshot.classification.model);
 if(!m)return{entry:null,model:null,calendar:null,issues:[...issues,{code:'CLASIFICACION_NO_RESUELTA',kind:'DATOS',message:snapshot.classification.reason}],notices,classification:snapshot.classification};
 if(config.inputHash&&config.inputHash!==snapshot.inputHash)throw Error('La información histórica cambió; volver a cargar y revisar las hipótesis');
 if(config.companyId!==undefined&&Number(config.companyId)!==snapshot.company.id)throw Error('Hipótesis de otra empresa');
 const calendar=forecastCalendar(snapshot.periods,config.calendar,snapshot.asOf);issues.push(...calendar.issues.map(message=>({code:'CALENDARIO_PENDIENTE',kind:'DATOS',message})));
 for(const period of snapshot.periods)for(const key of m.requiredHistory){const item=period.fields[key];if(item?.value==null||item.validation!=='VALIDADO')issues.push({code:'HISTORICO_PENDIENTE',kind:'DATOS',field:key,period:period.periodEnd,message:item?.reason??'Concepto o nota no disponible'});}
 if(snapshot.periods.length!==4||calendar.periods.length!==5)return{entry:null,model:m,calendar,issues,notices,classification:declared?{...snapshot.classification,declared}:snapshot.classification};
 const histories=snapshot.periods.map(p=>({ejercicio:p.fiscalYear,publicado:p.publication,fuente:p.provider+':'+p.document,valores:Object.fromEntries(Object.entries(p.fields).map(([k,v])=>[k,v.validation==='VALIDADO'?v.value:null]))}));
 const constants=Object.fromEntries(m.constants.map(k=>[k,cited(config.constants?.[k],snapshot.asOf,k)]));
 if(!config.constants?.shares)constants.shares=snapshot.asOf===snapshot.periods.at(-1).periodEnd?snapshot.periods.at(-1).fields.shares?.value??null:null;
 for(let i=0;i<5;i++){const p=calendar.periods[i],duration=day(p.end)-day(p.start)+1,annual=day(p.fiscalEnd??p.end)-day(p.fiscalStart??p.start)+1;constants['periodDays.'+i]=duration;constants['yearFraction.'+i]=duration/annual;}
 let opening;
 const last=snapshot.periods.at(-1),bridge=config.valuationBridge;
 if(snapshot.asOf!==last.periodEnd||bridge){
  if(!bridge)issues.push({code:'PUENTE_FECHA_VALORACION_PENDIENTE',kind:'DATOS',message:'El saldo del último cierre no es un balance a fecha de valoración. Se requieren puente de apertura y flujos del período transcurrido acreditados.'});
  else{
   if(bridge.asOf!==snapshot.asOf||bridge.currency!==last.currency||bridge.basis!==last.basis||bridge.norm!==last.norm||!bridge.source||!bridge.reviewer)throw Error('Puente de valoración sin contexto, fuente o revisión declarada');
   const stocks=[...m.requiredHistory.filter(k=>!['revenue','netIncome','ebit','da'].includes(k)),...m.openingExtras];opening={};for(const key of stocks){opening[key]=cited(bridge.balances?.[key],snapshot.asOf,'apertura '+key);if(snapshot.asOf===last.periodEnd&&last.fields[key]?.value!=null&&opening[key]!==last.fields[key].value)throw Error('No se sustituye un saldo histórico original en su mismo cierre: '+key);if(opening[key]===null)issues.push({code:'APERTURA_PENDIENTE',kind:'DATOS',field:key,message:'Saldo a fecha de valoración ausente'});}
   if(!config.constants?.shares)constants.shares=cited(bridge.balances?.shares,snapshot.asOf,'acciones a fecha de valoración');
   if(['assets','liabilities','equity'].every(k=>typeof opening[k]==='number')&&Math.abs(opening.assets-opening.liabilities-opening.equity)>1e-4)issues.push({code:'APERTURA_NO_CONCILIADA',kind:'DATOS',message:'El puente de apertura no concilia activo, pasivo y patrimonio'});
  }
 }
 if(![13,14].includes(m.id)&&!bridge)for(const key of m.openingExtras)issues.push({code:'NOTA_APERTURA_PENDIENTE',kind:'DATOS',field:key,message:'Desglose fiscal de apertura requerido; no se deduce de gasto por impuestos'});
 const scenarios=[0,1,2].map(s=>Object.fromEntries(m.drivers.map(k=>[k,cited(config.scenarios?.[s]?.[k],snapshot.asOf,'caso '+(s+1)+' '+k,true)])));
 const assets=[];
 if(![13,14].includes(m.id)){
  if(config.assets){if(!Array.isArray(config.assets)||config.assets.length>150)throw Error('Calendario de activos inválido');for(const a of config.assets){if(!a.source||!a.referenceDate)throw Error('Activo sin fuente y fecha');date(a.referenceDate);if(a.referenceDate>snapshot.asOf)throw Error('Fuente de activo posterior a valoración');assets.push({...a});}}
  else for(const cls of['PPE','INTANGIBLE','ROU','AGOTABLE','NO_DEPRECIABLE'])assets.push({id:'PENDIENTE_'+cls,clase:cls,metodo:cls==='NO_DEPRECIABLE'?'NINGUNO':cls==='AGOTABLE'?'PRODUCCION':'LINEAL',neto:null,residual:null,vida:null,tasaDecreciente:null,reservas:null,fechaServicio:null,fechaAdquisicion:null,adicionAnio:null,financiacion:'APERTURA',tipoCapex:'NO_APLICABLE',pagoPendienteApertura:null});
  for(const a of assets)if(a.adicionAnio!==null)for(let s=0;s<3;s++){const key='capex.'+a.id;scenarios[s][key]=cited(config.scenarios?.[s]?.[key],snapshot.asOf,key,true);}
  if(!config.assets)issues.push({code:'COHORTES_PENDIENTES',kind:'METODO',message:'Faltan desglose de activos, vidas, residuales, fechas y nuevas inversiones acreditadas. No se trasladan cohortes sintéticas.'});
 }
 const ledger=[];
 if(![13,14].includes(m.id)){
  const policy=config.accountingPolicy;
  if(!policy||!policy.source||!policy.referenceDate||!policy.reviewer||policy.scope!=='PERIMETRO_COMPLETO'||!Array.isArray(policy.lines))issues.push({code:'PERIMETRO_CONTABLE_PENDIENTE',kind:'METODO',message:'Identificar todas las otras partidas, OCI, fiscalidad y clasificación de flujos. Una lista vacía exige evidencia de que no existen otras partidas.'});
  else{
   date(policy.referenceDate);if(policy.referenceDate>snapshot.asOf||policy.lines.length>80)throw Error('Política contable fuera de fecha o perímetro');
   for(const line of policy.lines){const value=cited({value:line.opening,source:line.source,referenceDate:line.referenceDate},snapshot.asOf,'otra partida '+line.id);ledger.push({...line,opening:value});for(let s=0;s<3;s++)for(const part of['stock','noncashPnl','oci','cashIncome','recognition']){const key='ledger.'+line.id+'.'+part;scenarios[s][key]=cited(config.scenarios?.[s]?.[key],snapshot.asOf,key,true);}}
   const stocks=opening??Object.fromEntries(Object.entries(last.fields).map(([k,v])=>[k,v.value]));
   const sum=(items)=>items.every(x=>typeof x==='number')?items.reduce((a,b)=>a+b,0):null;
   const fixed=sum(assets.filter(a=>a.adicionAnio===null).map(a=>a.neto)),otherA=sum(ledger.filter(l=>l.side==='ASSET').map(l=>l.opening)),otherL=sum(ledger.filter(l=>l.side==='LIABILITY').map(l=>l.opening));
   const totalA=sum([fixed,stocks.cash,stocks.inventory,stocks.receivables,stocks.contractAssets,stocks.taxReceivable,stocks.deferredTaxAsset,otherA]),totalL=sum([stocks.debt,stocks.leaseDebt,stocks.payables,stocks.contractLiabilities,constants.capexPayableOpening,stocks.taxPayable,stocks.deferredTaxLiability,otherL]);
   for(const [name,calculated,reported]of[['activo',totalA,stocks.assets],['pasivo',totalL,stocks.liabilities]])if(calculated===null||typeof reported!=='number'||Math.abs(calculated-reported)>Math.max(1e-4,Math.abs(reported)*1e-10))issues.push({code:'PERIMETRO_APERTURA_NO_CONCILIADO',kind:'DATOS',field:name,message:'El desglose de apertura no coincide con su total acreditado. No se utiliza caja ni otra partida residual como ajuste.'});
  }
 }
 const ledgerDrivers=ledger.flatMap(l=>['stock','noncashPnl','oci','cashIncome','recognition'].map(p=>'ledger.'+l.id+'.'+p));
 const validConstants=new Set(m.constants),validDrivers=new Set([...m.drivers,...ledgerDrivers,...assets.filter(a=>a.adicionAnio!==null).map(a=>'capex.'+a.id)]);
 for(const key of Object.keys(config.constants??{}))if(!validConstants.has(key))throw Error('Constante no admitida en este modelo: '+key);
 for(const scenario of config.scenarios??[])for(const key of Object.keys(scenario))if(!validDrivers.has(key))throw Error('Driver no admitido en este modelo: '+key);
 if(!config.terminalSource)issues.push({code:'POLITICA_TERMINAL_PENDIENTE',kind:'METODO',message:'Falta la justificación de continuidad o liquidación'});
 const entry={sector:m.id,empresaId:String(snapshot.company.id),tipo:'EMPRESA',moneda:snapshot.periods.at(-1).currency??'DESCONOCIDA',escala:1,norma:snapshot.periods.at(-1).norm??'NO_ACREDITADA',perimetro:snapshot.periods.at(-1).basis??'NO_ACREDITADO',asOf:snapshot.asOf,historicos:histories,activos:assets,escenarios:scenarios,constantes:constants,leasing:'FINANCIACION',terminal:[8,9].includes(m.id)?'FINITO':'CONTINUIDAD_ACREDITADA',terminalFuente:config.terminalSource??'PENDIENTE: política terminal documentada',fechaEventos:'SEGMENTOS_ACT_ACT_FISCAL',periodosFuturos:calendar.periods,aperturaValoracion:opening,contabilidadCompleta:![13,14].includes(m.id),metodoDiasCirculante:workingCapitalDays(config),otrasPartidas:ledger,evidenciaEntrada:{version:snapshot.version,hash:snapshot.inputHash,empresaId:String(snapshot.company.id),asOf:snapshot.asOf,elegible:issues.length===0}};
 return{entry,model:m,calendar,issues,notices,classification:declared?{...snapshot.classification,declared}:snapshot.classification};
}
function evaluate(snapshot,config={}){
 const preparation=buildEntry(snapshot,config),result={version:'G2_SECTORIAL_DEV_0.2',source:snapshot.source==='MYSQL_SOLO_LECTURA'?'EMPRESA_MYSQL':'QA_SINTETICO_NO_EMPRESA',company:snapshot.company,asOf:snapshot.asOf,inputHash:snapshot.inputHash,configurationHash:hash(config),model:preparation.model,calendar:preparation.calendar,status:'BLOQUEADO',financialApproval:'PENDIENTE',issues:preparation.issues,scenarios:[],requiredInputs:[],history:snapshot.periods,classification:preparation.classification,notices:preparation.notices,capitalModule:{version:capital.VERSION,modified:false}};
 if(!preparation.entry)return{result,entry:null,plan:null};
 const plan=crearPlan(preparation.entry),missing=plan.grafo.nodos.filter(n=>n.expr===undefined&&n.valor==null);result.requiredInputs=missing.map(n=>({id:n.id,sheet:n.hoja,row:n.fila,col:n.columna,label:n.etiqueta,unit:n.unidad}));
 const family=preparation.model.family;
 for(let scenario=1;scenario<=3;scenario++){
  const values=plan.grafo.evaluar({'control.case':scenario}),get=(key,i=0)=>{const expr=plan.salida[key]?.[i];if(!expr)return null;const x=typeof expr==='number'?expr:values.get(expr.ref);return typeof x==='number'?x:null;};
  const states=Object.fromEntries(Object.entries(plan.salida).map(([key,items])=>[key,items.map((_,i)=>get(key,i))]));
  const base={ke:get('ke'),kd:get('kd'),pesoPatrimonio:scenariosValue(plan,values,'driver.weightEquity.0'),pesoDeuda:null,impuesto:scenariosValue(plan,values,'driver.tax.0'),familia:family};base.pesoDeuda=base.pesoPatrimonio==null?null:1-base.pesoPatrimonio;
  const premium=premiums.calcularPrimasAutomaticas({fecha:snapshot.asOf,empresa:{...snapshot.company,clasificacionResuelta:true,familia:family},incorporaciones:[],bursatil:[],capitalizacion:{estado:'NO_CONCILIADA'}},[],undefined);
  const rates=Object.values(base).filter(x=>typeof x!=='string').every(x=>typeof x==='number')?capital.recalcularCapital(base,[],snapshot.asOf,snapshot.company.codigo_iso):null;
  if(rates&&get('wacc')!==null&&Math.abs(rates.waccBase-get('wacc'))>1e-10)throw Error('Diferencia con módulo Capital vigente');
  const financialMissing=preparation.issues.some(x=>x.kind==='DATOS'||x.kind==='METODO');
  result.scenarios.push({id:scenario,name:['Conservador','Base','Optimista'][scenario-1],status:get('price')!==null&&!financialMissing?'CALCULADO_PENDIENTE_REVISION':'BLOQUEADO',valuePerShare:financialMissing?null:get('price'),rawCalculatedValue:financialMissing?null:get('price'),states,capital:{rates,premiums:premium},warnings:rates?[]:['Componentes de capital no acreditados/completos']});
 }
 result.status=result.scenarios.every(s=>s.status==='CALCULADO_PENDIENTE_REVISION')?'CALCULADO_PENDIENTE_REVISION':'BLOQUEADO';result.resultHash=hash({inputHash:result.inputHash,configurationHash:result.configurationHash,scenarios:result.scenarios,status:result.status});
 return{result,entry:preparation.entry,plan};
}
function scenariosValue(plan,values,key){const value=values.get(key);return typeof value==='number'?value:null;}
module.exports={buildEntry,evaluate,cited};
