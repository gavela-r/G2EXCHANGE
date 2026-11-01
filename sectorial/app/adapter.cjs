const crypto=require('node:crypto');
const {MAPEO_SECTORES}=require('./vendor/mapeoSectores.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x;}catch{return null;}};
const date=x=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)throw Error('Fecha civil inválida');return x;};
const MAP={INGRESOS:'revenue',COSTE_VENTAS:'cogs',BENEFICIO_BRUTO:'grossProfit',GASTOS_OPERATIVOS:'opex',EBITDA:'ebitda',EBIT:'ebit',DEPRECIACION_AMORTIZACION:'da',BENEFICIO_ANTES_IMPUESTOS:'preTax',IMPUESTO_BENEFICIOS:'taxExpense',BENEFICIO_NETO:'netIncome',EFECTIVO:'cash',ACTIVOS_TOTALES:'assets',PASIVOS_TOTALES:'liabilities',PATRIMONIO_NETO:'equity',INVENTARIOS:'inventory',CUENTAS_COBRAR:'receivables',CUENTAS_PAGAR:'payables',DEUDA_CORTO_PLAZO:'shortDebt',DEUDA_LARGO_PLAZO:'longDebt',DEUDA_TOTAL:'totalDebtReported',CAPEX:'capex',FLUJO_CAJA_OPERATIVO:'cfo',FLUJO_CAJA_INVERSION:'cfi',FLUJO_CAJA_FINANCIACION:'cff',DIVIDENDOS_PAGADOS:'dividends',ACCIONES_EN_CIRCULACION:'shares',GASTO_INTERESES:'interest',ACTIVOS_CORRIENTES:'currentAssets',PASIVOS_CORRIENTES:'currentLiabilities',INMOVILIZADO_MATERIAL:'PPE',INMOVILIZADO_INTANGIBLE:'INTANGIBLE',DERECHOS_USO:'ROU',PASIVO_ARRENDAMIENTOS:'leaseDebt',ACTIVOS_CONTRACTUALES:'contractAssets',PASIVOS_CONTRACTUALES:'contractLiabilities'};
// Componentes de balance (migración 34, server/src/pcv/secAnualVerificado.ts TAGS_SEC_COMPONENTES). No son campos de la
// plantilla: se combinan en derive*() con trazabilidad (registros, reglas y ausencias acreditadas).
const COMPONENTES=['ARREND_OPERATIVO_TOTAL','ARREND_OPERATIVO_CORRIENTE','ARREND_OPERATIVO_NO_CORRIENTE','ARREND_FINANCIERO_TOTAL','ARREND_FINANCIERO_CORRIENTE','ARREND_FINANCIERO_NO_CORRIENTE','ARREND_IFRS_TOTAL','ARREND_IFRS_CORRIENTE','ARREND_IFRS_NO_CORRIENTE','ACT_CONTRACTUAL_TOTAL','ACT_CONTRACTUAL_CORRIENTE','ACT_CONTRACTUAL_NO_CORRIENTE','PAS_CONTRACTUAL_TOTAL','PAS_CONTRACTUAL_CORRIENTE','PAS_CONTRACTUAL_NO_CORRIENTE','INGRESO_DIFERIDO_TOTAL','INGRESO_DIFERIDO_CORRIENTE','INGRESO_DIFERIDO_NO_CORRIENTE','DEUDA_LP_TOTAL','DEUDA_LP_CORRIENTE','DEUDA_LP_NO_CORRIENTE','EMPRESTITOS_CORTO_PLAZO','PAPEL_COMERCIAL','DEUDA_FINANCIERA_COMBINADA','PRESTAMOS_IFRS_TOTAL','IMPUESTO_CORRIENTE_PAGAR','IMPUESTO_CORRIENTE_COBRAR','ACTIVO_IMPUESTO_DIFERIDO','PASIVO_IMPUESTO_DIFERIDO','INMOVILIZADO_MATERIAL_NETO','DERECHO_USO_OPERATIVO','INTANGIBLES_NETOS','FONDO_COMERCIO','PARTICIPACIONES_NO_DOMINANTES','VALORES_NEGOCIABLES_CORRIENTES','VALORES_NEGOCIABLES_NO_CORRIENTES'];
// Clasificación por código oficial de actividad (evidencia ACCEPTED/HIGH con plantilla explícita en evidence_json).
const CRITERIOS_PLANTILLA=new Set(['SEC_SIC_PLANTILLA_V1','TSE33_PLANTILLA_V1']);
// Perímetro de BENEFICIO_NETO y PATRIMONIO_NETO por etiqueta XBRL; réplica de server/src/pcv/seleccionObservaciones.ts
// (perimetroDeEtiqueta), comprobada por sectorial/app/tests/perimetro.test.cjs.
function perimeter(code,tag){const t=String(tag??'').split(':').pop();
 if(/AttributableToOwnersOfParent|AttributableToParent$/.test(t))return'DOMINANTE';if(/IncludingPortionAttributableToNoncontrollingInterest/.test(t))return'TOTAL';
 if(code==='BENEFICIO_NETO'){if(['NetIncomeLoss','NetIncomeLossAvailableToCommonStockholdersBasic'].includes(t))return'DOMINANTE';if(['ProfitLoss','ProfitLossIFRS','IncomeAfterTaxes','NetIncome'].includes(t))return'TOTAL';}
 if(code==='PATRIMONIO_NETO'){if(['StockholdersEquity','PartnersCapital','MembersEquity'].includes(t))return'DOMINANTE';if(['NetAssets','Equity','EquityIFRS','NetAssetsSummaryOfBusinessResults'].includes(t))return'TOTAL';}
 return null;}
const FUENTES_PAIS={US:['SEC_EDGAR'],JP:['EDINET'],TW:['FINMIND','MOPS']};
const flow=new Set(['revenue','cogs','grossProfit','opex','ebitda','ebit','da','preTax','taxExpense','netIncome','capex','cfo','cfi','cff','dividends','interest']);
function observe(row,proofs,report,context){
 const result={value:null,rawValue:row.importe,recordId:row.id,concept:row.concepto,code:row.concepto_estandar,reportId:report.id,document:report.identificador_fuente,provider:report.fuente,periodEnd:report.fecha_fin_periodo,publication:report.fecha_publicacion,validation:'PENDIENTE',reason:'Sin atestación compatible por registro/importe/contexto',currency:context?.currency??null,unit:row.unidad_tipo??null,scale:null,basis:context?.basis??null,norm:null};
 if(row.importe===null){result.reason='NULL original';return result;}
 const amount=Number(row.importe);if(!Number.isFinite(amount)||Math.abs(amount)>Number.MAX_SAFE_INTEGER){result.reason='Importe fuera de precisión soportada';return result;}
 const conflicts=proofs.filter(p=>p.concept_code===row.concepto_estandar&&p.outcome==='CONFLICT_PRESERVED'&&p.payload?.evidence?.originals?.some(x=>x.id===row.id));
 if(conflicts.length){result.validation='CONFLICTIVO';result.reason='Importe original preservado difiere de la evidencia oficial; no se sustituye';result.conflicts=conflicts.map(p=>({verificationId:p.id,candidate:p.payload.evidence.candidate?.importe,document:p.payload.evidence.candidate?.identifier,evidenceHash:p.evidence_hash??hash(p.payload)}));}
 const candidates=proofs.filter(p=>p.concept_code===row.concepto_estandar&&['INSERTED','NULL_FILLED','VERIFIED_EXISTING'].includes(p.outcome)&&p.payload?.evidence&&(p.payload.evidence.record_id===row.id||p.payload.evidence.record_ids?.includes(row.id)));
 const accepted=[];
 for(const proof of candidates){
  const c=proof.payload.evidence.candidate,ctx=proof.payload.context,e=c?.evidence??{};
  if(!c||c.importe===null||c.importe===undefined||c.importe===''||typeof c.importe==='boolean'||!Number.isFinite(Number(c.importe))||Number(c.importe)!==amount||c.identifier!==report.identificador_fuente||c.concepto!==row.concepto||!ctx?.currency||!context||ctx.currency!==context.currency||ctx.basis!==context.basis||c.basis!==ctx.basis||!['consolidated','standalone'].includes(ctx.basis))continue;
  if((e.end??c.end)!==report.fecha_fin_periodo||(e.filed??c.filed)!==report.fecha_publicacion)continue;
  const mapped=MAP[row.concepto_estandar],monetary=row.unidad_tipo==='MONEDA';
  if(monetary&&(c.currency!==ctx.currency||(e.unit&&e.unit!==ctx.currency)))continue;
  if(mapped==='shares'&&!['shares','SHARES'].includes(c.currency??e.unit))continue;
  if(flow.has(mapped)&&(!e.start||e.start!==ctx.start))continue;
  // The verified SEC parser rawFacts explicitly resolves unqualified tags in facts['us-gaap'].
  // Require its tag/identity evidence, rather than inferring GAAP from a country or exchange.
  const secNamespace=report.fuente==='SEC_EDGAR'&&!row.concepto.includes(':')&&e.tag===row.concepto&&ctx.identity?.cik&&e.cik===ctx.identity.cik;
  const norm=/^us-gaap:/.test(row.concepto)||secNamespace?'US_GAAP':/IFRS/.test(row.concepto)||/^ifrs-full:/.test(row.concepto)?'IFRS':/^jppfs_cor:/.test(row.concepto)?'JGAAP':null;
  if(!norm){result.reason='Norma no acreditada por el concepto atestado';continue;}
  let value=amount;
  if((mapped==='capex'||mapped==='dividends')&&value<0){const local=row.concepto.split(':').pop(),alias=report.fuente==='SEC_EDGAR'?row.alias_sec:report.fuente==='EDINET'?row.alias_edinet:null;if(!alias||alias!==local){result.reason='Salida negativa sin convención de signo exacta';continue;}value=-value;}
  if(mapped==='da'&&(value<0||/impairment|reversal|reserve/i.test(row.concepto))){result.reason='Tag no representa D&A total compatible';continue;}
  accepted.push({...result,value,scale:1,unit:monetary?ctx.currency:c.currency??e.unit,validation:'VALIDADO',reason:null,norm,periodStart:flow.has(mapped)?e.start:null,verificationId:proof.id,evidenceHash:proof.evidence_hash??hash(proof.payload),sourceHash:e.responseHash??e.documentHash??null,normalization:value===amount?'CANDIDATE_NORMALIZED_BASE_UNITS':'EXACT_CASH_OUTFLOW_SIGN',source:report.fuente==='SEC_EDGAR'?'https://www.sec.gov/Archives/edgar/data/':report.fuente==='EDINET'?'https://disclosure2.edinet-fsa.go.jp/':null});
 }
 if(!accepted.length)return result;
 if(new Set(accepted.map(x=>[x.value,x.currency,x.basis,x.norm,x.periodStart].join('|'))).size!==1)return{...result,reason:'Atestaciones incompatibles del mismo registro',validation:'CONFLICTIVO'};
 return accepted[0];
}
const tolerancia=v=>Math.max(1,Math.abs(v)*1e-4);
// Estado de cada componente: V (atestado), NA (no presentado en el documento, evidencia NOT_PRESENTED), C (conflicto), P.
function estadoComponentes(observations,ausentes){
 return Object.fromEntries(COMPONENTES.map(code=>{const all=observations.filter(x=>x.code===code),valid=all.filter(x=>x.validation==='VALIDADO'),values=new Set(valid.map(x=>[x.value,x.norm,x.currency,x.basis].join('|')));
  return[code,valid.length&&values.size===1?{estado:'V',...valid[0],allRecordIds:valid.map(x=>x.recordId)}:values.size>1||all.some(x=>x.validation==='CONFLICTIVO')?{estado:'C',code}:ausentes.has(code)?{estado:'NA',code}:{estado:'P',code,reason:all.map(x=>x.reason).filter(Boolean).join('; ')||'Componente no cargado'}];}));
}
// Total directo o suma de partes; una parte sólo cuenta como inexistente con evidencia NOT_PRESENTED.
function totalOPartes(c,total,partes){
 const T=c[total],P=partes.map(p=>c[p]);
 if(T.estado==='C'||P.some(p=>p.estado==='C'))return{estado:'C',motivo:'Componente en conflicto con la evidencia'};
 if(T.estado==='V'){if(P.every(p=>p.estado==='V')){const suma=P.reduce((a,p)=>a+p.value,0);if(Math.abs(suma-T.value)>tolerancia(T.value))return{estado:'C',motivo:'Total y partes atestados no concilian'};}return{estado:'V',value:T.value,inputs:[T],regla:total};}
 if(P.some(p=>p.estado==='V')&&P.every(p=>p.estado==='V'||p.estado==='NA')){const v=P.filter(p=>p.estado==='V');return{estado:'V',value:v.reduce((a,p)=>a+p.value,0),inputs:v,noPresentados:P.filter(p=>p.estado==='NA').map(p=>p.code),regla:partes.join(' + ')};}
 if(T.estado==='NA'&&P.every(p=>p.estado==='NA'))return{estado:'NA'};
 return{estado:'P'};
}
function derivarComponentes(fields,observations,ausentes,parsed){
 const c=estadoComponentes(observations,ausentes),verif=code=>parsed.filter(p=>p.outcome==='NOT_PRESENTED'&&p.concept_code===code).map(p=>p.id);
 const fijar=(key,res,familia,regla)=>{
  if(res.estado==='V'){const ctx=new Set(res.inputs.map(x=>[x.norm,x.currency,x.basis].join('|')));if(ctx.size!==1){fields[key]={value:null,validation:'PENDIENTE',code:key,reason:'Componentes con contexto (norma/moneda/base) incompatible'};return;}
   fields[key]={...res.inputs[0],value:res.value,recordId:null,code:key,validation:'VALIDADO',derivation:{rule:regla??res.regla,inputs:res.inputs.map(x=>x.code),records:res.inputs.flatMap(x=>x.allRecordIds??[x.recordId]),noPresentados:res.noPresentados??[]},reason:null};return;}
  if(res.estado==='C'){fields[key]={value:null,validation:'CONFLICTIVO',code:key,reason:res.motivo};return;}
  if(familia&&ausentes.has(familia)){fields[key]={value:0,validation:'NO_APLICABLE',code:key,reason:'No presentado en el documento original del cierre ('+familia+'); no se trata como cero contable sino como partida no presentada',evidence:{family:familia,verificationIds:verif(familia)}};return;}
  if(fields[key]?.validation==='VALIDADO')return;
  fields[key]={value:null,validation:'PENDIENTE',code:key,reason:res.estado==='NA'?'Familia presentada con etiquetas no extraídas':'Componentes no atestados'};
 };
 // Deuda financiera (sin arrendamientos). Precedencia documentada; un candidato alternativo que difiera > 5 % la bloquea.
 const cand=[],corto=(()=>{const E=c.EMPRESTITOS_CORTO_PLAZO,P=c.PAPEL_COMERCIAL;
  if(E.estado==='C'||P.estado==='C')return{estado:'C'};
  if(E.estado==='V'&&P.estado==='V')return P.value<=E.value+tolerancia(E.value)?{estado:'V',value:E.value,inputs:[E],nota:'Papel comercial incluido en empréstitos a corto plazo'}:{estado:'C',motivo:'Papel comercial superior a los empréstitos a corto plazo'};
  if(E.estado==='V')return{estado:'V',value:E.value,inputs:[E]};if(P.estado==='V')return{estado:'V',value:P.value,inputs:[P]};
  return ausentes.has('FAMILIA_DEUDA_CORTO_PLAZO_OTRA')?{estado:'NA'}:{estado:'P'};})();
 if(c.DEUDA_FINANCIERA_COMBINADA.estado==='V')cand.push({estado:'V',value:c.DEUDA_FINANCIERA_COMBINADA.value,inputs:[c.DEUDA_FINANCIERA_COMBINADA],regla:'DEUDA_FINANCIERA_COMBINADA'});
 if(fields.shortDebt?.validation==='VALIDADO'&&fields.longDebt?.validation==='VALIDADO')cand.push({estado:'V',value:fields.shortDebt.value+fields.longDebt.value,inputs:[fields.shortDebt,fields.longDebt],regla:'DEUDA_CORTO_PLAZO + DEUDA_LARGO_PLAZO',arrendamientoFinanciero:/CapitalLease|FinanceLease/.test(fields.longDebt.concept??'')});
 const lp=(()=>{const t=c.DEUDA_LP_TOTAL;if(t.estado==='V')return{estado:'V',value:t.value,inputs:[t]};const nc=c.DEUDA_LP_NO_CORRIENTE.estado==='V'?c.DEUDA_LP_NO_CORRIENTE:fields.longDebt?.validation==='VALIDADO'&&!/CapitalLease|FinanceLease/.test(fields.longDebt.concept??'')?{...fields.longDebt,estado:'V'}:null,cu=c.DEUDA_LP_CORRIENTE;
  if(nc&&(cu.estado==='V'||cu.estado==='NA'))return{estado:'V',value:nc.value+(cu.estado==='V'?cu.value:0),inputs:cu.estado==='V'?[nc,cu]:[nc]};return null;})();
 if(lp&&(corto.estado==='V'||corto.estado==='NA'))cand.push({estado:'V',value:lp.value+(corto.estado==='V'?corto.value:0),inputs:[...lp.inputs,...(corto.estado==='V'?corto.inputs:[])],regla:'DEUDA_LP (incl. vencimientos corrientes) + EMPRÉSTITOS/PAPEL COMERCIAL',noPresentados:corto.estado==='NA'?['FAMILIA_DEUDA_CORTO_PLAZO_OTRA']:[]});
 if(c.PRESTAMOS_IFRS_TOTAL.estado==='V')cand.push({estado:'V',value:c.PRESTAMOS_IFRS_TOTAL.value,inputs:[c.PRESTAMOS_IFRS_TOTAL],regla:'PRESTAMOS_IFRS_TOTAL'});
 let deudaConArrendamientoFinanciero=false;
 if(cand.length){const elegido=cand[0],discrepa=cand.slice(1).find(x=>Math.abs(x.value-elegido.value)>Math.max(tolerancia(elegido.value),Math.abs(elegido.value)*0.05));
  if(discrepa)fijar('debt',{estado:'C',motivo:'Definiciones de deuda atestadas incompatibles: '+elegido.regla+' frente a '+discrepa.regla},null);else{fijar('debt',elegido,null,elegido.regla);deudaConArrendamientoFinanciero=!!elegido.arrendamientoFinanciero;}}
 else fijar('debt',{estado:corto.estado==='C'?'C':'P',motivo:'Componentes de deuda en conflicto'},'FAMILIA_DEUDA_FINANCIERA');
 // Arrendamientos: NIIF 16 total, o operativo + financiero (sin el financiero si ya está dentro de la deuda).
 const ifrs=totalOPartes(c,'ARREND_IFRS_TOTAL',['ARREND_IFRS_CORRIENTE','ARREND_IFRS_NO_CORRIENTE']),op=totalOPartes(c,'ARREND_OPERATIVO_TOTAL',['ARREND_OPERATIVO_CORRIENTE','ARREND_OPERATIVO_NO_CORRIENTE']),fin=totalOPartes(c,'ARREND_FINANCIERO_TOTAL',['ARREND_FINANCIERO_CORRIENTE','ARREND_FINANCIERO_NO_CORRIENTE']);
 if(ifrs.estado==='V')fijar('leaseDebt',ifrs,'FAMILIA_ARRENDAMIENTOS','Pasivos por arrendamiento NIIF 16');
 else if([op,fin].some(x=>x.estado==='C'))fijar('leaseDebt',{estado:'C',motivo:'Componentes de arrendamiento en conflicto'},null);
 else if((op.estado==='V'||op.estado==='NA')&&(fin.estado==='V'||fin.estado==='NA')&&(op.estado==='V'||fin.estado==='V')){const partes=[op,...(deudaConArrendamientoFinanciero?[]:[fin])].filter(x=>x.estado==='V');
  fijar('leaseDebt',partes.length?{estado:'V',value:partes.reduce((a,x)=>a+x.value,0),inputs:partes.flatMap(x=>x.inputs),noPresentados:[...(op.noPresentados??[]),...(fin.noPresentados??[])]}:{estado:'NA'},'FAMILIA_ARRENDAMIENTOS',deudaConArrendamientoFinanciero?'Arrendamientos operativos (los financieros ya figuran en la deuda)':'Arrendamientos operativos + financieros');}
 else fijar('leaseDebt',{estado:'P'},'FAMILIA_ARRENDAMIENTOS');
 fijar('contractAssets',totalOPartes(c,'ACT_CONTRACTUAL_TOTAL',['ACT_CONTRACTUAL_CORRIENTE','ACT_CONTRACTUAL_NO_CORRIENTE']),'FAMILIA_ACT_CONTRACTUALES');
 // Pasivos contractuales: contratos con clientes (ASC 606/NIIF 15) y, si no se presentan, ingresos diferidos.
 const pc=totalOPartes(c,'PAS_CONTRACTUAL_TOTAL',['PAS_CONTRACTUAL_CORRIENTE','PAS_CONTRACTUAL_NO_CORRIENTE']);
 fijar('contractLiabilities',pc.estado==='V'||pc.estado==='C'?pc:totalOPartes(c,'INGRESO_DIFERIDO_TOTAL',['INGRESO_DIFERIDO_CORRIENTE','INGRESO_DIFERIDO_NO_CORRIENTE']),'FAMILIA_PAS_CONTRACTUALES');
 const simple=(key,code,familia)=>fijar(key,c[code].estado==='V'?{estado:'V',value:c[code].value,inputs:[c[code]],regla:code}:{estado:c[code].estado},familia);
 simple('taxPayable','IMPUESTO_CORRIENTE_PAGAR','FAMILIA_IMPUESTO_CORRIENTE_PAGAR');simple('taxReceivable','IMPUESTO_CORRIENTE_COBRAR','FAMILIA_IMPUESTO_CORRIENTE_COBRAR');
 simple('deferredTaxAsset','ACTIVO_IMPUESTO_DIFERIDO','FAMILIA_ACTIVO_IMPUESTO_DIFERIDO');simple('deferredTaxLiability','PASIVO_IMPUESTO_DIFERIDO','FAMILIA_PASIVO_IMPUESTO_DIFERIDO');
 simple('PPE','INMOVILIZADO_MATERIAL_NETO',null);simple('ROU','DERECHO_USO_OPERATIVO','FAMILIA_DERECHO_USO');simple('INTANGIBLE','INTANGIBLES_NETOS','FAMILIA_INTANGIBLES');simple('goodwill','FONDO_COMERCIO','FAMILIA_FONDO_COMERCIO');
 simple('nci','PARTICIPACIONES_NO_DOMINANTES','FAMILIA_PARTICIPACIONES_NO_DOMINANTES');
 // Valores negociables e inversiones financieras (activo financiero no operativo para el puente al valor del accionista).
 const vn=[c.VALORES_NEGOCIABLES_CORRIENTES,c.VALORES_NEGOCIABLES_NO_CORRIENTES];
 fijar('marketableSecurities',vn.some(x=>x.estado==='C')?{estado:'C',motivo:'Valores negociables en conflicto'}:vn.some(x=>x.estado==='V')&&vn.every(x=>x.estado==='V'||x.estado==='NA')?{estado:'V',value:vn.filter(x=>x.estado==='V').reduce((a,x)=>a+x.value,0),inputs:vn.filter(x=>x.estado==='V'),noPresentados:vn.filter(x=>x.estado==='NA').map(x=>x.code),regla:'VALORES_NEGOCIABLES_CORRIENTES + VALORES_NEGOCIABLES_NO_CORRIENTES'}:{estado:vn.every(x=>x.estado==='NA')?'NA':'P'},'FAMILIA_VALORES_NEGOCIABLES');
 if(fields.inventory?.validation!=='VALIDADO'&&fields.inventory?.validation!=='CONFLICTIVO'&&ausentes.has('FAMILIA_INVENTARIOS'))fijar('inventory',{estado:'NA'},'FAMILIA_INVENTARIOS');
 return Object.fromEntries(Object.entries(c).map(([k,v])=>[k,{estado:v.estado,value:v.estado==='V'?v.value:null,concept:v.concept??null,recordId:v.recordId??null}]));
}
function mapPeriod(raw,proofs,report,reportEvidence){
 const parsed=proofs.map(p=>({...p,payload:parse(p.evidence_json)}));
 const contexts=[reportEvidence?.context,...parsed.map(p=>p.payload?.context)].filter(Boolean);
 const keys=new Set(contexts.map(c=>[c.currency,c.basis,c.start].join('|'))),context=contexts[0]??null,issues=[];
 if(keys.size!==1||!context?.currency||!['consolidated','standalone'].includes(context?.basis))issues.push('Contexto anual ambiguo o ausente');
 const days=context?.start?(Date.parse(report.fecha_fin_periodo)-Date.parse(context.start))/86400000+1:0;if(days<350||days>381)issues.push('Duración anual no acreditada');
 const observations=raw.map(r=>observe(r,parsed,report,issues.length?null:context));
 const fields={};
 for(const [code,key]of Object.entries(MAP)){
  const all=observations.filter(x=>x.code===code),valid=all.filter(x=>x.validation==='VALIDADO'),values=new Set(valid.map(x=>[x.value,x.norm,x.currency,x.basis].join('|')));
  fields[key]=valid.length&&values.size===1?{...valid[0],allRecordIds:valid.map(x=>x.recordId),...(['BENEFICIO_NETO','PATRIMONIO_NETO'].includes(code)?{perimeter:new Set(valid.map(x=>perimeter(code,x.concept))).size===1?perimeter(code,valid[0].concept):null}:{})}:{value:null,validation:values.size>1||all.some(x=>x.validation==='CONFLICTIVO')?'CONFLICTIVO':'PENDIENTE',code,reason:values.size>1?'Totales atestados incompatibles':all.length?all.map(x=>x.reason).filter(Boolean).join('; '):'Concepto ausente',recordIds:all.map(x=>x.recordId)};
 }
 const derive=(key,deps,fn)=>{if(fields[key]?.value!=null||fields[key]?.validation==='CONFLICTIVO'||!deps.every(k=>fields[k]?.validation==='VALIDADO'))return;const inputs=deps.map(k=>fields[k]);if(new Set(inputs.map(x=>[x.norm,x.currency,x.basis].join('|'))).size!==1)return;fields[key]={...inputs[0],value:fn(...inputs.map(x=>x.value)),recordId:null,code:key,validation:'VALIDADO',derivation:{rule:deps.join(' / '),inputs:deps,records:inputs.flatMap(x=>x.allRecordIds??[x.recordId])},reason:null};};
 derive('ebitda',['ebit','da'],(a,b)=>a+b);derive('cogs',['revenue','grossProfit'],(a,b)=>a-b);
 const ausentes=new Set(parsed.filter(p=>p.outcome==='NOT_PRESENTED'&&p.payload?.source_identifier===report.identificador_fuente&&p.payload?.evidence?.end===report.fecha_fin_periodo).map(p=>p.concept_code));
 const componentes=derivarComponentes(fields,observations,ausentes,parsed);derive('liabilitiesEquity',['liabilities','equity'],(a,b)=>a+b);derive('balanceDifference',['assets','liabilitiesEquity'],(a,b)=>a-b);
 const norms=new Set(Object.values(fields).filter(x=>x.validation==='VALIDADO').map(x=>x.norm));if(norms.size>1)issues.push('Normas incompatibles dentro del mismo cierre');
 return{reportId:report.id,fiscalYear:Number(report.fecha_fin_periodo.slice(0,4)),periodStart:context?.start??null,periodEnd:report.fecha_fin_periodo,publication:report.fecha_publicacion,document:report.identificador_fuente,provider:report.fuente,currency:context?.currency??null,basis:context?.basis??null,norm:norms.size===1?[...norms][0]:null,fields,componentes,ausentes:[...ausentes].sort(),observations,issues,rawRecords:raw.length,validatedRecords:observations.filter(x=>x.validation==='VALIDADO').length};
}
async function search(db,q=''){if(q.length>100)throw Error('Búsqueda demasiado larga');const[r]=await db.query(`SELECT e.id,e.nombre_empresa,e.sector_id,s.nombre_sector,p.codigo_iso,MIN(i.ticker) ticker FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN sector s ON s.id=e.sector_id LEFT JOIN instrumento i ON i.empresa_id=e.id WHERE e.nombre_empresa LIKE ? OR i.ticker LIKE ? GROUP BY e.id ORDER BY e.nombre_empresa LIMIT 40`,['%'+q+'%',q+'%']);return r;}
// Plantilla de cada evidencia aceptada: explícita (código oficial de actividad → plantilla, criterio versionado) o vía el
// sector MySQL acreditado (mapeo no REVISAR). Varias evidencias aceptadas con plantillas distintas: contradicción.
async function resolverClasificacion(db,company,asOf){
 const[classes]=await db.query('SELECT c.id,c.sector_id,c.source,c.reference_date,c.criterion,c.confidence,c.status,c.evidence_hash,c.evidence_json,s.nombre_sector FROM classification_evidence c LEFT JOIN sector s ON s.id=c.sector_id WHERE empresa_id=? AND reference_date<=? ORDER BY reference_date DESC,id DESC LIMIT 20',[company.id,asOf]);
 const plantillaDe=cl=>{if(CRITERIOS_PLANTILLA.has(cl.criterion)){const p=Number(parse(cl.evidence_json)?.plantilla);return Number.isInteger(p)&&p>=1&&p<=16?{model:p,method:cl.criterion}:null;}const m=MAPEO_SECTORES[cl.sector_id];return m&&m.clasificacion!=='REVISAR'&&m.nombre.toLowerCase()===cl.nombre_sector?.toLowerCase()?{model:Number(m.plantilla),method:m.clasificacion}:null;};
 const aceptadas=classes.filter(cl=>cl.status==='ACCEPTED'&&cl.confidence==='HIGH').map(cl=>({cl,p:plantillaDe(cl)})).filter(x=>x.p),modelos=new Set(aceptadas.map(x=>x.p.model));
 const nominalM=MAPEO_SECTORES[company.sector_id],nominal=nominalM?Number(nominalM.plantilla):null,base={sectorId:company.sector_id,sectorName:company.nombre_sector,nominal};
 if(modelos.size>1)return{...base,model:null,status:'BLOQUEADO',method:'CONTRADICCION',evidence:aceptadas.map(x=>({id:x.cl.id,criterion:x.cl.criterion,model:x.p.model})),reason:'Evidencias de clasificación aceptadas con plantillas distintas'};
 if(modelos.size===1){const x=aceptadas[0];return{...base,sectorId:x.cl.sector_id??company.sector_id,sectorName:x.cl.nombre_sector??company.nombre_sector,model:x.p.model,status:'RESUELTO',method:x.p.method,evidence:{id:x.cl.id,criterion:x.cl.criterion,source:x.cl.source,reference_date:x.cl.reference_date,evidence_hash:x.cl.evidence_hash},reason:null};}
 // Sin evidencia aceptada: sólo el sector MySQL acreditado sin evidencias pendientes o rechazadas.
 const resolved=!classes.length&&nominalM&&nominalM.clasificacion!=='REVISAR'&&nominalM.nombre.toLowerCase()===company.nombre_sector?.toLowerCase();
 return{...base,model:resolved?nominal:null,status:resolved?'RESUELTO':'BLOQUEADO',method:nominalM?.clasificacion??'SIN_MAPEO',evidence:null,reason:resolved?null:'Clasificación pendiente, contradictoria o sin mapeo acreditado'};
}
async function loadCompany(db,id,asOf){
 date(asOf);if(!Number.isSafeInteger(id)||id<1)throw Error('Empresa inválida');
 const[rows]=await db.query('SELECT e.id,e.nombre_empresa,e.sector_id,s.nombre_sector,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN sector s ON s.id=e.sector_id WHERE e.id=?',[id]);if(rows.length!==1)throw Error('Empresa inexistente');const company=rows[0];
 const[instruments]=await db.query('SELECT id,ticker,isin,moneda,mercado_id FROM instrumento WHERE empresa_id=? ORDER BY id LIMIT 20',[id]);
 const classification=await resolverClasificacion(db,company,asOf);
 // Sólo informes de la fuente del país de la empresa: hubo documentos EDINET de emisores japoneses asignados a empresas
 // de Taiwán por colisión de código bursátil (identidad cruzada, migración 32); nunca se valoran con ellos.
 const fuentes=FUENTES_PAIS[company.codigo_iso];if(!fuentes)throw Error('País sin fuente primaria acreditada');
 const[reports]=await db.query(`SELECT id,empresa_id,fecha_fin_periodo,fecha_publicacion,fuente,identificador_fuente FROM informe_financiero WHERE empresa_id=? AND tipo_periodo='ANUAL' AND fuente IN (?) AND fecha_fin_periodo<=? AND fecha_publicacion<=? AND EXISTS(SELECT 1 FROM partida_contable_valor p WHERE p.informe_id=informe_financiero.id) ORDER BY fecha_fin_periodo DESC,fecha_publicacion DESC,id DESC LIMIT 24`,[id,fuentes,asOf,asOf]);
 const periods=[],issues=[],years=new Set();
 for(const report of reports){const year=Number(report.fecha_fin_periodo.slice(0,4));if(years.has(year))continue;years.add(year);if(periods.length===4)break;
  const duplicates=reports.filter(x=>x.fecha_fin_periodo===report.fecha_fin_periodo);if(duplicates.length>1){issues.push({code:'INFORME_AMBIGUO',periodEnd:report.fecha_fin_periodo,reports:duplicates.map(x=>x.id)});}
  const[raw]=await db.query('SELECT p.id,p.concepto,p.importe,p.nivel_confianza,t.concepto_estandar,t.unidad_tipo,t.alias_sec,t.alias_edinet FROM partida_contable_valor p LEFT JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE informe_id=? ORDER BY p.id LIMIT 1501',[report.id]);
  const[proofs]=await db.query('SELECT id,concept_code,outcome,evidence_hash,evidence_json FROM pcv_verification_evidence WHERE informe_id=? ORDER BY id DESC LIMIT 1501',[report.id]);
  const[ev]=await db.query('SELECT evidence_json FROM financial_report_evidence WHERE informe_id=? LIMIT 2',[report.id]);
  if(raw.length>1500||proofs.length>1500)issues.push({code:'LIMITE_LECTURA',reportId:report.id});
  periods.push(mapPeriod(raw,proofs,report,ev.length===1?parse(ev[0].evidence_json):null));
 }
 periods.reverse();if(periods.length!==4)issues.push({code:'CUATRO_EJERCICIOS_NO_DISPONIBLES',available:periods.length});
 if(periods.some((p,i)=>i&&p.fiscalYear!==periods[i-1].fiscalYear+1))issues.push({code:'EJERCICIOS_NO_CONSECUTIVOS'});
 if(new Set(periods.map(p=>[p.currency,p.basis,p.norm].join('|'))).size>1)issues.push({code:'CONTEXTO_CAMBIA_ENTRE_CIERRES'});
 if(periods.some(p=>p.issues.length))issues.push({code:'CONTEXTO_FINANCIERO_INCOMPLETO'});
 const result={version:'MYSQL_SECTORIAL_READONLY_0.2',readAt:new Date().toISOString(),asOf,company,instruments,classification,periods,issues,source:'MYSQL_SOLO_LECTURA',immutableHistory:true};result.inputHash=hash({asOf,company,classification,periods,issues});return result;
}
module.exports={perimeter,MAP,COMPONENTES,FUENTES_PAIS,flow,hash,date,observe,mapPeriod,search,loadCompany,resolverClasificacion,derivarComponentes};
