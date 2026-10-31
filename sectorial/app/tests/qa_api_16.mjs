// QA de la ruta de exportación de la API con expedientes COMPLETOS sintéticos.
// Recorre exactamente workflow.evaluate -> exporter.exportWorkbook -> native-qa.validateNative.
// Nunca entra por la API (el servidor sólo acepta snapshots del adaptador MySQL), nunca se guarda
// en data/runs y cada libro se rotula como "PRUEBA SINTÉTICA QA — NO ES UNA EMPRESA".
// Uso (desde integracion_v02): node tests/qa_api_16.mjs [--sin-excel] [sector ...]
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const{evaluate}=require(path.join(root,'workflow.cjs')),{models}=require(path.join(root,'registry.cjs')),{fixture}=require(path.join(root,'engine/dist/fixtures.js')),store=require(path.join(root,'store.cjs')),{validateNative}=require(path.join(root,'native-qa.cjs'));
const{exportWorkbook}=await import(new URL('../exporter.mjs',import.meta.url));
const args=process.argv.slice(2),native=!args.includes('--sin-excel'),events=args.includes('--eventos'),only=args.filter(x=>/^\d+$/.test(x)).map(Number),out=path.join(root,events?'qa_api_eventos':'qa_api');fs.mkdirSync(out,{recursive:true});
const SRC='QA sintético del arnés tests/qa_api_16.mjs (no es evidencia de emisor)',REF='2026-03-31',asOf='2026-03-31';
const cite=value=>({value,source:SRC,referenceDate:REF}),cites=values=>({values,source:SRC,referenceDate:REF});
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const FLOWS=new Set(['revenue','netIncome','ebit','da']);

function snapshotFor(sector){
 const f=fixture(sector,2025),periods=f.historicos.map((h,i)=>{
  const v={...h.valores};v.liabilities=sector===13?v.deposits+v.wholesale:sector===14?v.insuranceLiability:v.assets-v.equity;
  for(const k of['taxPayable','taxReceivable','deferredTaxAsset','deferredTaxLiability'])v[k]=0;
  return{reportId:-(sector*10+i),fiscalYear:h.ejercicio,periodStart:h.ejercicio+'-01-01',periodEnd:h.ejercicio+'-12-31',publication:h.publicado,document:'QA-'+sector+'-'+h.ejercicio,provider:'QA_SINTETICO',currency:'USD',basis:'consolidated',norm:'QA_NO_CERTIFICA_NORMA',
   fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,{value:x,validation:'VALIDADO',code:k,reason:null,recordIds:[]}])),observations:[],issues:[],rawRecords:0,validatedRecords:0};});
 const company={id:-sector,nombre_empresa:'QA SINTÉTICO SECTOR '+String(sector).padStart(2,'0')+' (no es empresa)',sector_id:null,nombre_sector:models[sector-1].name,codigo_iso:'US'};
 const classification={sectorId:null,sectorName:models[sector-1].name,model:sector,status:'RESUELTO',method:'QA_FORZADO',evidence:null,reason:null};
 const s={version:'MYSQL_SECTORIAL_READONLY_0.2',readAt:new Date().toISOString(),asOf,company,instruments:[],classification,periods,issues:[],source:'QA_SINTETICO_ARNES',immutableHistory:true};
 s.inputHash=sha({asOf,company,classification,periods,issues:[]});return{snapshot:s,fixture:f};
}

function configurationFor(sector,snapshot,f,operatingPaid){
 const m=models[sector-1],last=snapshot.periods.at(-1),financial=[13,14].includes(sector);
 const constants=Object.fromEntries(m.constants.map(k=>[k,cite(k==='capexPayableOpening'?0:f.constantes[k]??null)]));
 const assets=financial?undefined:f.activos.filter(a=>!(a.clase==='AGOTABLE'&&a.neto===0&&![8,9].includes(sector))).map(a=>{const y=a.adicionAnio,start=y===null?'2020-01-01':(2026+y)+(a.clase==='ROU'?'-07-01':'-01-01');return{...a,fechaServicio:start,fechaAdquisicion:start,pagoPendienteApertura:0,source:SRC,referenceDate:REF};});
 if(events&&assets){const ppe=assets.find(a=>a.id==='PPE_apertura');ppe.eventos=[{id:'DET',tipo:'DETERIORO',fecha:'2027-06-30',importe:10},{id:'REV',tipo:'REVISION',fecha:'2028-03-31',vidaNueva:6},{id:'BAJA',tipo:'BAJA',fecha:'2029-09-30',fraccion:0.2,cobro:15}];
  assets.push({id:'PPE_evento',clase:'PPE',metodo:'LINEAL',neto:0,residual:0,vida:8,tasaDecreciente:0,reservas:1,fechaServicio:'2027-07-01',fechaAdquisicion:'2027-07-01',adicionAnio:null,financiacion:'CAJA',tipoCapex:'CRECIMIENTO',pagoPendienteApertura:0,eventos:[{id:'ALTA',tipo:'ALTA',fecha:'2027-07-01',importe:20,fechaPago:'2028-01-15'}],source:SRC,referenceDate:REF});}
 const TAX={'tax.adjustments':0,'tax.nolLimit':1,'tax.payable':0,'tax.receivable':0,'tax.dta':0,'tax.dtl':0,'tax.oci':0};
 const scenarios=[0,1,2].map(s=>{const c=f.escenarios[s],o={};for(const k of m.drivers){if(k==='tax.operatingPaid')o[k]=cites(operatingPaid?.[s]??[0,0,0,0,0]);else if(k in TAX)o[k]=cites(Array(5).fill(TAX[k]));else o[k]=cites(c[k]??[null,null,null,null,null]);}
  for(const a of assets??[])if(a.adicionAnio!==null)o['capex.'+a.id]=cites(c['capex.'+a.id]);return o;});
 const config={companyId:snapshot.company.id,inputHash:snapshot.inputHash,scenarios,constants,terminalSource:SRC+' — política terminal QA'};
 // Puente QA: saldos iguales al último cierre (supuesto sintético declarado, sin actividad intermedia).
 const stocks=[...m.requiredHistory.filter(k=>!FLOWS.has(k)),...m.openingExtras];
 config.valuationBridge={asOf,currency:last.currency,basis:last.basis,norm:last.norm,source:SRC,reviewer:'QA_ARNES',balances:Object.fromEntries(stocks.map(k=>[k,cite(last.fields[k].value)]))};
 if(!financial){
  config.assets=assets;
  config.accountingPolicy={source:SRC,referenceDate:REF,reviewer:'QA_ARNES',scope:'PERIMETRO_COMPLETO',lines:[]};
 }
 return config;
}

// Identidades financieras recalculadas fuera del grafo con los valores TS.
function identities(x,sector){
 const failures=[],checks={n:0},near=(a,b,label,tol=1e-6)=>{checks.n++;if(typeof a!=='number'||typeof b!=='number'||Math.abs(a-b)>tol*Math.max(1,Math.abs(b)))failures.push(label+': '+a+' vs '+b);};
 for(const sc of x.result.scenarios){const s=sc.states,t='E'+sc.id+' ';
  for(let i=0;i<5;i++){
   near(s.balanceDifference[i],0,t+'balance '+i);
   const prevCash=i?s.cash[i-1]:(x.entry.aperturaValoracion?.cash??x.entry.historicos[3].valores.cash);
   if(s.cfo)near(s.cash[i],prevCash+s.cfo[i]+(s.cfi?.[i]??0)+s.cff[i],t+'caja '+i);
   if(s.fixedAssets){checks.n++;if(!(s.fixedAssets[i]>=-1e-9))failures.push(t+'sobredepreciación '+i);for(const k of Object.keys(s).filter(k=>k.startsWith('assets.'))){checks.n++;if(!(s[k][i]>=-1e-9))failures.push(t+k+' negativo '+i);}}
   if(s.fixedAssets){// altas reconocidas = pagado + Δcrédito de inversión − Δanticipos; bajas contables = cobro − resultado
    const open=i?s.fixedAssets[i-1]:x.entry.activos.filter(a=>a.adicionAnio===null).reduce((a,c)=>a+c.neto,0),dPay=s.capexPayable[i]-(i?s.capexPayable[i-1]:x.entry.constantes.capexPayableOpening),dAdv=s.capexAdvance[i]-(i?s.capexAdvance[i-1]:0);
    near(s.fixedAssets[i],open+s.capex[i]+dPay-dAdv+s.leaseNew[i]-s.da[i]-s.impair[i]-(s.disposal[i]-s.gain[i]),t+'roll-forward inmovilizado '+i);}
   if(s.capex&&s.cfi)near(s.cfi[i],(s.disposal?.[i]??0)-s.capex[i],t+'CapEx en CFI '+i);
   if(s.ebitda&&s.ebit)near(s.ebit[i],s.ebitda[i]-s.da[i]-s.impair[i]+s.gain[i],t+'EBIT '+i);
   if(s.revenue&&s.cogs&&s.opex&&s.ebitda)near(s.ebitda[i],s.revenue[i]-s.cogs[i]-s.opex[i],t+'EBITDA '+i);
   if(s.preTax&&s.taxExpense)near(s.netIncome[i],s.preTax[i]-s.taxExpense[i],t+'beneficio neto '+i);
   near(s.valuationPV[i],s.valuationFlow[i]/s.valuationFactor[i],t+'VP flujo '+i);
   const df=i?s.valuationFactor[i-1]:1;near(s.valuationFactor[i],df*(1+s.valuationRate[i])**(x.entry.constantes['yearFraction.'+i]??1),t+'factor '+i);
  }
  near(s.explicitPV[0],s.valuationPV.reduce((a,b)=>a+b,0),t+'suma VP');
  near(s.terminalPV[0],s.terminal[0]/s.valuationFactor[4],t+'VP terminal');
  if(x.entry.terminal!=='FINITO'){const g=x.entry.escenarios[sc.id-1].terminalG[4],r=s.valuationRate[4];near(s.terminal[0],(s.terminalFlow?.[4]??NaN)/(r-g),t+'Gordon');}
  const ev=s.explicitPV[0]+s.terminalPV[0];near(s.enterprise[0],ev,t+'EV');
  if(x.result.model.family==='FCFF'){const o=x.entry.aperturaValoracion;near(s.equityValue[0],ev+o.cash-o.debt-o.leaseDebt-x.entry.constantes.capexPayableOpening,t+'puente EV-equity');}
  near(s.price[0],s.equityValue[0]/x.entry.constantes.shares,t+'valor por acción');
  if(s.wacc&&x.result.model.family==='FCFF'){const e=x.entry.escenarios[sc.id-1];near(s.ke[0],e.rf[0]+e.beta[0]*e.erp[0],t+'Ke CAPM');near(s.wacc[0],s.ke[0]*e.weightEquity[0]+e.kd[0]*(1-e.tax[0])*(1-e.weightEquity[0]),t+'WACC');}
 }
 return{checks:checks.n,failures};
}

const summary={at:new Date().toISOString(),engineHash:store.engineHash(),tipo:'QA_SINTETICO_RUTA_API_NO_APROBACION_FINANCIERA',native,sectors:[]};
for(const m of models){if(only.length&&!only.includes(m.id))continue;const row={sector:m.id,name:m.name,family:m.family};
 try{
  const{snapshot,fixture:f}=snapshotFor(m.id);let config=configurationFor(m.id,snapshot,f),x=evaluate(snapshot,config);
  if(m.drivers.includes('tax.operatingPaid')&&x.plan){// impuesto operativo de caja = tipo × EBIT positivo del propio escenario (EBIT no depende de él)
   const paid=x.result.scenarios.map((sc,s)=>sc.states.ebit.map((e,i)=>Math.max(0,e)*f.escenarios[s].tax[i]));config=configurationFor(m.id,snapshot,f,paid);x=evaluate(snapshot,config);}
  row.status=x.result.status;row.issues=x.result.issues.map(i=>i.code+(i.field?':'+i.field:''));row.missingInputs=x.result.requiredInputs.length;row.missingIds=x.result.requiredInputs.slice(0,12).map(i=>i.id);row.prices=x.result.scenarios.map(s=>s.valuePerShare);if(events&&x.result.scenarios[1])row.baseStates=Object.fromEntries(['capex','capexPayable','capexAdvance','impair','gain','disposal','da','fixedAssets'].map(k=>[k,x.result.scenarios[1].states[k]]));
  if(x.result.status==='CALCULADO_PENDIENTE_REVISION'){const id=identities(x,m.id);row.identityChecks=id.checks;row.identityFailures=id.failures;}
  if(native&&x.plan){const file=path.join(out,'QA_SECTOR_'+String(m.id).padStart(2,'0')+'.xlsx');for(const suffix of['','.draft.xlsx','.qa.json','.validation.json','.native-input.json'])fs.rmSync(file+suffix,{force:true});
   const run={id:sha({sector:m.id,input:snapshot.inputHash,config:x.result.configurationHash}).slice(0,64),engineHash:summary.engineHash,snapshot,configuration:config,result:x.result};
   const t0=Date.now(),{evidence}=await exportWorkbook(run,x,file);row.tsExcelArtifactChecks=evidence.comparisons;row.exportSeconds=(Date.now()-t0)/1000;
   const t1=Date.now(),v=await validateNative(run,x,file);row.native={status:v.status,repairMode:v.repairMode,formulaChecks:v.formulaChecks,brokenReferences:v.brokenReferences,capitalMutation:v.capitalMutation,seconds:(Date.now()-t1)/1000};row.file=path.relative(root,file);}
 }catch(e){row.error=String(e.message).slice(0,1500);}
 summary.sectors.push(row);console.log(JSON.stringify({sector:row.sector,status:row.status,prices:row.prices,identityFailures:row.identityFailures?.length,native:row.native?.status,formulaChecks:row.native?.formulaChecks,error:row.error?.slice(0,300)}));
}
fs.writeFileSync(path.join(out,(native?'qa_api_16':'qa_api_16_ts')+(only.length?'_'+only.join('-'):'')+'.json'),JSON.stringify(summary,null,2));
