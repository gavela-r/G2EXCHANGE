const crypto=require('node:crypto');
const {MAPEO_SECTORES}=require('./vendor/mapeoSectores.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x;}catch{return null;}};
const date=x=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)throw Error('Fecha civil inválida');return x;};
const MAP={INGRESOS:'revenue',COSTE_VENTAS:'cogs',BENEFICIO_BRUTO:'grossProfit',GASTOS_OPERATIVOS:'opex',EBITDA:'ebitda',EBIT:'ebit',DEPRECIACION_AMORTIZACION:'da',BENEFICIO_ANTES_IMPUESTOS:'preTax',IMPUESTO_BENEFICIOS:'taxExpense',BENEFICIO_NETO:'netIncome',EFECTIVO:'cash',ACTIVOS_TOTALES:'assets',PASIVOS_TOTALES:'liabilities',PATRIMONIO_NETO:'equity',INVENTARIOS:'inventory',CUENTAS_COBRAR:'receivables',CUENTAS_PAGAR:'payables',DEUDA_CORTO_PLAZO:'shortDebt',DEUDA_LARGO_PLAZO:'longDebt',DEUDA_TOTAL:'totalDebtReported',CAPEX:'capex',FLUJO_CAJA_OPERATIVO:'cfo',FLUJO_CAJA_INVERSION:'cfi',FLUJO_CAJA_FINANCIACION:'cff',DIVIDENDOS_PAGADOS:'dividends',ACCIONES_EN_CIRCULACION:'shares',GASTO_INTERESES:'interest',ACTIVOS_CORRIENTES:'currentAssets',PASIVOS_CORRIENTES:'currentLiabilities',INMOVILIZADO_MATERIAL:'PPE',INMOVILIZADO_INTANGIBLE:'INTANGIBLE',DERECHOS_USO:'ROU',PASIVO_ARRENDAMIENTOS:'leaseDebt',ACTIVOS_CONTRACTUALES:'contractAssets',PASIVOS_CONTRACTUALES:'contractLiabilities'};
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
  fields[key]=valid.length&&values.size===1?{...valid[0],allRecordIds:valid.map(x=>x.recordId)}:{value:null,validation:values.size>1||all.some(x=>x.validation==='CONFLICTIVO')?'CONFLICTIVO':'PENDIENTE',code,reason:values.size>1?'Totales atestados incompatibles':all.length?all.map(x=>x.reason).filter(Boolean).join('; '):'Concepto ausente',recordIds:all.map(x=>x.recordId)};
 }
 const derive=(key,deps,fn)=>{if(fields[key]?.value!=null||fields[key]?.validation==='CONFLICTIVO'||!deps.every(k=>fields[k]?.validation==='VALIDADO'))return;const inputs=deps.map(k=>fields[k]);if(new Set(inputs.map(x=>[x.norm,x.currency,x.basis].join('|'))).size!==1)return;fields[key]={...inputs[0],value:fn(...inputs.map(x=>x.value)),recordId:null,code:key,validation:'VALIDADO',derivation:{rule:deps.join(' / '),inputs:deps,records:inputs.flatMap(x=>x.allRecordIds??[x.recordId])},reason:null};};
 derive('ebitda',['ebit','da'],(a,b)=>a+b);derive('cogs',['revenue','grossProfit'],(a,b)=>a-b);derive('debt',['shortDebt','longDebt'],(a,b)=>a+b);derive('liabilitiesEquity',['liabilities','equity'],(a,b)=>a+b);derive('balanceDifference',['assets','liabilitiesEquity'],(a,b)=>a-b);
 const norms=new Set(Object.values(fields).filter(x=>x.validation==='VALIDADO').map(x=>x.norm));if(norms.size>1)issues.push('Normas incompatibles dentro del mismo cierre');
 return{reportId:report.id,fiscalYear:Number(report.fecha_fin_periodo.slice(0,4)),periodStart:context?.start??null,periodEnd:report.fecha_fin_periodo,publication:report.fecha_publicacion,document:report.identificador_fuente,provider:report.fuente,currency:context?.currency??null,basis:context?.basis??null,norm:norms.size===1?[...norms][0]:null,fields,observations,issues,rawRecords:raw.length,validatedRecords:observations.filter(x=>x.validation==='VALIDADO').length};
}
async function search(db,q=''){if(q.length>100)throw Error('Búsqueda demasiado larga');const[r]=await db.query(`SELECT e.id,e.nombre_empresa,e.sector_id,s.nombre_sector,p.codigo_iso,MIN(i.ticker) ticker FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN sector s ON s.id=e.sector_id LEFT JOIN instrumento i ON i.empresa_id=e.id WHERE e.nombre_empresa LIKE ? OR i.ticker LIKE ? GROUP BY e.id ORDER BY e.nombre_empresa LIMIT 40`,['%'+q+'%',q+'%']);return r;}
async function loadCompany(db,id,asOf){
 date(asOf);if(!Number.isSafeInteger(id)||id<1)throw Error('Empresa inválida');
 const[rows]=await db.query('SELECT e.id,e.nombre_empresa,e.sector_id,s.nombre_sector,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN sector s ON s.id=e.sector_id WHERE e.id=?',[id]);if(rows.length!==1)throw Error('Empresa inexistente');const company=rows[0];
 const[instruments]=await db.query('SELECT id,ticker,isin,moneda,mercado_id FROM instrumento WHERE empresa_id=? ORDER BY id LIMIT 20',[id]);
 const[classes]=await db.query('SELECT c.id,c.sector_id,c.source,c.reference_date,c.confidence,c.status,c.evidence_hash,s.nombre_sector FROM classification_evidence c LEFT JOIN sector s ON s.id=c.sector_id WHERE empresa_id=? AND reference_date<=? ORDER BY reference_date DESC,id DESC LIMIT 1',[id,asOf]);
 const cl=classes[0],accepted=cl?.status==='ACCEPTED'&&cl.confidence==='HIGH',sectorId=accepted?cl.sector_id:company.sector_id,sectorName=accepted?cl.nombre_sector:company.nombre_sector,m=MAPEO_SECTORES[sectorId];
 const resolved=(!cl||accepted)&&m&&m.clasificacion!=='REVISAR'&&m.nombre.toLowerCase()===sectorName?.toLowerCase();
 const classification={sectorId,sectorName,model:resolved?Number(m.plantilla):null,status:resolved?'RESUELTO':'BLOQUEADO',method:m?.clasificacion??'SIN_MAPEO',evidence:accepted?cl:null,reason:resolved?null:'Clasificación pendiente, contradictoria o sin mapeo acreditado'};
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
module.exports={MAP,FUENTES_PAIS,flow,hash,date,observe,mapPeriod,search,loadCompany};
