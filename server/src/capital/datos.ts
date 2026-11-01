import type {Pool} from 'mysql2/promise';
import type {CampoFinanciero,Dato,Empresa,PeriodoFinanciero,Indicador,Incorporacion} from '../../../valuation_engine/research/coste_capital/src/tipos';
import {calcularFinancieros,calcularVolatilidadFcf,desviacionMuestral,fechaValida} from '../../../valuation_engine/research/coste_capital/src/indicadores';
import {evaluarIndicador,METODOLOGIAS} from '../../../valuation_engine/research/coste_capital/src/evaluacion';
import {construirBenchmark} from '../../../valuation_engine/research/coste_capital/src/comparables';
import {MAPEO_SECTORES} from '../valoracion/mapeoSectores';
import {fechaCivil} from './fecha';
import {capitalizacion,liquidezBursatil} from './indicadores';
import {hash,identidadEstructural,serie,calendarioObservaciones} from './historico';
import fs from 'node:fs';
import path from 'node:path';
import {raizProyecto} from '../valoracion/rutas';
import {manifiestoCapital} from './manifiesto';
import {calcularPrimasAutomaticas,type MetodoPrecio} from './primas';
const parse=(x:any)=>typeof x==='string'?JSON.parse(x):x;
const pruebaRegistro=(v:any,id:number)=>v.payload.evidence?.record_id===id||v.payload.evidence?.record_ids?.includes(id);
const campos:Record<string,CampoFinanciero>={EFECTIVO:'efectivo',DEUDA_CORTO_PLAZO:'deudaFinancieraCP',DEUDA_LARGO_PLAZO:'deudaFinancieraLP',INVENTARIOS:'inventarios',EBIT:'ebit',GASTO_INTERESES:'interesesGastoPositivo',EBITDA:'ebitda',FLUJO_CAJA_OPERATIVO:'cfo',CAPEX:'capexSalidaPositiva',INGRESOS:'ingresos',ACTIVOS_TOTALES:'activosTotales',ACTIVOS_CORRIENTES:'activosCorrientes',PASIVOS_CORRIENTES:'pasivosCorrientes',PREPAGOS:'prepagos'};
export class DatosCapital {
 constructor(public pool:Pool){}
 async empresas(query=''){
  if(query.length>100)throw Error('Búsqueda demasiado larga');
  const [r]:any=await this.pool.query(`SELECT e.id,e.nombre_empresa,p.codigo_iso,MIN(i.ticker) ticker FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN instrumento i ON i.empresa_id=e.id
  WHERE e.nombre_empresa LIKE ? OR i.ticker LIKE ? GROUP BY e.id ORDER BY e.nombre_empresa LIMIT 50`,['%'+query+'%',query+'%']);return r;
 }
 async periodos(id:number,asOf:string){
  fechaCivil(asOf);const [reports]:any=await this.pool.query(`SELECT * FROM informe_financiero WHERE empresa_id=? AND tipo_periodo='ANUAL' AND fecha_fin_periodo<=? AND fecha_publicacion<=? ORDER BY fecha_fin_periodo DESC,id DESC LIMIT 12`,[id,asOf,asOf]);
  const result:any[]=[];const years=new Set<string>();
  for(const r of reports){
   // No se elige una segunda versión del mismo cierre silenciosamente.
   if(reports.filter((x:any)=>x.fecha_fin_periodo===r.fecha_fin_periodo).length>1)continue;
   if(years.has(r.fecha_fin_periodo.slice(0,4)))continue;years.add(r.fecha_fin_periodo.slice(0,4));
   const [evidence]:any=await this.pool.query('SELECT * FROM financial_report_evidence WHERE informe_id=? ORDER BY id DESC LIMIT 2',[r.id]);
   const re=evidence.length===1?parse(evidence[0].evidence_json):null;
   const [ver]:any=await this.pool.query(`SELECT * FROM pcv_verification_evidence WHERE informe_id=? ORDER BY id DESC LIMIT 1000`,[r.id]);
   const [raw]:any=await this.pool.query(`SELECT p.*,t.concepto_estandar,t.signo_esperado,t.alias_sec,t.alias_edinet FROM partida_contable_valor p LEFT JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE p.informe_id=? LIMIT 2000`,[r.id]);
   const attest=ver.map((v:any)=>({...v,payload:parse(v.evidence_json)}));
   const [overlay]:any=await this.pool.query('SELECT * FROM capital_financial_evidence WHERE informe_id=? AND civil_period_end=? AND publication_date<=? ORDER BY id DESC LIMIT 1',[r.id,r.fecha_fin_periodo,asOf]);
   const ox=overlay[0]?parse(overlay[0].evidence_json):null;
   const context=re?.context??attest.find((v:any)=>v.payload.context)?.payload.context??ox?.context;
   const start=context?.start??re?.start??re?.period_start;
   const currency=context?.currency??null,basis=context?.basis??(re?.identity?.consolidated===true?'consolidated':null);
   const duration=start?(Date.parse(r.fecha_fin_periodo)-Date.parse(start))/86400000+1:0;
   const datos:PeriodoFinanciero['datos']={},issues:string[]=[],recordIds:number[]=[];
   if(!context||!currency||!['consolidated','standalone'].includes(basis)||duration<350||duration>381)issues.push('Contexto anual/moneda/consolidación no acreditado');
   for(const [code,field] of Object.entries(campos)){
    const candidates=raw.filter((x:any)=>x.concepto_estandar===code&&x.importe!==null);
    const vals=new Set(candidates.map((x:any)=>Number(x.importe)));
    if(vals.size!==1)continue;
    const row=candidates[0],value=Number(row.importe);
    const proof=attest.find((v:any)=>['INSERTED','NULL_FILLED','VERIFIED_EXISTING'].includes(v.outcome)
     &&v.concept_code===code&&pruebaRegistro(v,row.id)
     &&Number(v.payload.evidence?.candidate?.importe)===value
     &&v.payload.evidence?.candidate?.identifier===r.identificador_fuente
     &&v.payload.context?.currency===currency&&v.payload.context?.basis===basis);
    if(!proof||!Number.isFinite(value)||issues.length)continue;
    const candidate=proof.payload.evidence.candidate,ce=candidate.evidence??{};
    const end=ce.end??candidate.end;
    // Identidad, periodo y escala deben corresponder a esta misma observación.
    if(end!==r.fecha_fin_periodo||ce.filed&&ce.filed!==r.fecha_publicacion||candidate.currency!==currency||ce.unit!==currency||Math.abs(value)>Number.MAX_SAFE_INTEGER)continue;
    let n=value;
    if(code==='CAPEX'&&n<0){const local=row.concepto.split(':').pop();const alias=r.fuente==='SEC_EDGAR'?row.alias_sec:row.alias_edinet;if(!alias||local!==alias)continue;n=-n;}
    if(code==='GASTO_INTERESES'&&n<=0)continue;
    const sourceUrl=r.fuente==='SEC_EDGAR'?'https://www.sec.gov/Archives/edgar/data/':'https://disclosure2.edinet-fsa.go.jp/';
    datos[field]={valor:n,unidad:'MONEDA',moneda:currency,fecha:r.fecha_fin_periodo,conocidoDesde:r.fecha_publicacion,
     fuente:{identificador:`${r.fuente}:${r.identificador_fuente}:pcv=${row.id}:verification=${proof.id}`,url:sourceUrl},validado:true};recordIds.push(row.id);
   }
   // Derivación con los mismos inputs ya acreditados; no toma EBITDA precalculado ambiguo.
   if(!datos.ebitda&&datos.ebit){const da=raw.filter((x:any)=>x.concepto_estandar==='DEPRECIACION_AMORTIZACION');
    const proof=attest.find((v:any)=>v.concept_code==='DEPRECIACION_AMORTIZACION'&&['INSERTED','NULL_FILLED','VERIFIED_EXISTING'].includes(v.outcome)&&da.some((d:any)=>pruebaRegistro(v,d.id)&&Number(d.importe)===Number(v.payload.evidence?.candidate?.importe)));
    if(proof&&proof.payload.evidence.candidate.evidence?.end===r.fecha_fin_periodo&&proof.payload.evidence.candidate.evidence?.unit===currency&&da.length===1&&Number(da[0].importe)>=0&&!/impairment|reversal|reserve/i.test(da[0].concepto))datos.ebitda={...datos.ebit,valor:datos.ebit.valor!+Number(da[0].importe),fuente:{...datos.ebit.fuente,identificador:datos.ebit.fuente.identificador+`:DA=${da[0].id}`}};
   }
   if(overlay.length&&!issues.length){const x=parse(overlay[0].evidence_json);
    if(x.context?.currency===currency&&x.context?.basis===basis&&x.publication===r.fecha_publicacion&&x.periodEnd===r.fecha_fin_periodo){
     for(const [field,d] of Object.entries(x.fields??{}) as [CampoFinanciero,Dato][]){if(!['activosCorrientes','pasivosCorrientes','prepagos'].includes(field))continue;if(datos[field]&&datos[field]!.valor!==d.valor){issues.push('Conflicto con observación adicional '+field);delete datos[field];}else datos[field]=d;}
    }
   }
   result.push({informeId:r.id,fuente:r.fuente,publicacion:r.fecha_publicacion,moneda:currency,basis,periodo:{inicio:start??r.fecha_fin_periodo,fin:r.fecha_fin_periodo,datos},limitaciones:issues,recordIds,evidencia:re,conciliacionId:overlay[0]?.id??null});
  }return result;
 }
 async diagnostico(id:number,asOf:string,periodEnd?:string){
  if(periodEnd)fechaCivil(periodEnd);
  fechaCivil(asOf);const [co]:any=await this.pool.query('SELECT e.*,p.codigo_iso,s.nombre_sector FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN sector s ON s.id=e.sector_id WHERE e.id=?',[id]);if(co.length!==1)throw Error('Empresa inexistente');
  const company=co[0];const [instruments]:any=await this.pool.query('SELECT i.*,m.nombre_bolsa FROM instrumento i JOIN mercado m ON m.id=i.mercado_id WHERE i.empresa_id=?',[id]);
  const blocked=instruments.map((i:any)=>identidadEstructural({...i,codigo_iso:company.codigo_iso})).find(Boolean);
  const [classes]:any=await this.pool.query(`SELECT c.*,s.nombre_sector FROM classification_evidence c JOIN sector s ON s.id=c.sector_id WHERE empresa_id=? AND reference_date<=? ORDER BY reference_date DESC,id DESC LIMIT 1`,[id,asOf]);
  const cl=classes[0];const sectorId=cl?.status==='ACCEPTED'&&cl?.confidence==='HIGH'?cl.sector_id:company.sector_id;
  const sectorName=sectorId===cl?.sector_id?cl.nombre_sector:company.nombre_sector;
  const mapping=MAPEO_SECTORES[sectorId];const resolved=mapping&&mapping.clasificacion!=='REVISAR'&&mapping.nombre.toLowerCase()===sectorName?.toLowerCase();
  const configDir=path.join(raizProyecto(),'valuation_engine/generator/sector_configs');
  const configFile=resolved?fs.readdirSync(configDir).find(f=>f.startsWith(mapping.plantilla+'_')&&f.endsWith('.json')):null;
  const config=configFile?JSON.parse(fs.readFileSync(path.join(configDir,configFile),'utf8')):null;
  const family=config?.family??'INDETERMINADA';
  const empresa:Empresa={id:String(id),sector:resolved?sectorName:'SIN_RESOLVER',pais:company.codigo_iso,region:company.codigo_iso,mercado:instruments[0]?.nombre_bolsa??'DESCONOCIDO',modeloNegocio:resolved?sectorName:'SIN_RESOLVER',familia:(family==='INDETERMINADA'?'FCFF':family)};
  const periods=blocked?[]:await this.periodos(id,asOf);const latest=periodEnd?periods.find(p=>p.periodo.fin===periodEnd):periods[0];
  if(periodEnd&&!latest)throw Error('Periodo no disponible para esta fecha');
  const indicadores:Indicador[]=latest?calcularFinancieros(empresa,asOf,latest.moneda??'XXX',latest.periodo):[];
  const historic=latest?periods.filter(p=>p.periodo.fin<=latest.periodo.fin):[];
  if(historic.length>1&&/^[A-Z]{3}$/.test(latest.moneda??'')&&historic.every(p=>p.moneda===latest.moneda&&p.basis===latest.basis))indicadores.push(calcularVolatilidadFcf(empresa,asOf,latest.moneda,historic.map(p=>p.periodo)));
  if(family==='INDETERMINADA')indicadores.forEach(i=>i.limitaciones.push('Familia sin resolver: resultado descriptivo; no autoriza aplicación del modelo FCFF'));
  const number=(field:CampoFinanciero)=>latest?.periodo.datos[field]?.validado===true?latest.periodo.datos[field]!.valor:null;
  const operating={ingresos:number('ingresos'),ebitda:number('ebitda'),ebit:number('ebit'),activosTotales:number('activosTotales'),activosOperativos:number('activosOperativos')};
  const margin=operating.ingresos!=null&&operating.ingresos>0&&operating.ebit!=null?operating.ebit/operating.ingresos:null;
  const consistent=historic.length>=2&&historic.every((p,index)=>p.moneda===latest.moneda&&p.basis===latest.basis&&p.periodo.datos.ebit?.validado&&p.periodo.datos.ingresos?.validado&&p.periodo.datos.ingresos.valor!>0&&(!index||Number(historic[index-1].periodo.fin.slice(0,4))-Number(p.periodo.fin.slice(0,4))===1));
  const stability=consistent?desviacionMuestral(historic.map(p=>p.periodo.datos.ebit!.valor!/p.periodo.datos.ingresos!.valor!)):null;
  const tamano={operativo:{...operating,moneda:latest?.moneda??null,periodo:latest?.periodo.fin??null},financiero:{deudaBruta:indicadores.find(i=>i.id==='DEUDA_BRUTA')?.valor??null,deudaNeta:indicadores.find(i=>i.id==='DEUDA_NETA')?.valor??null,deudaNetaEbitda:indicadores.find(i=>i.id==='DEUDA_NETA_EBITDA')?.valor??null},rentabilidad:{margenEbit:margin,roa:null,roe:null},estabilidadOperativa:{estado:stability==null?'NO_ESTIMABLE':'CALCULABLE',valor:stability,n:historic.length,definicion:'Desviación estándar muestral del margen EBIT anual; exige serie homogénea completa y consecutiva',motivo:stability==null?'Serie completa no acreditada':'Estadística descriptiva, no coeficiente de prima'},diversificacionGeografica:{estado:'NO_ESTIMABLE',valor:null},accesoFinanciacion:{estado:'NO_ESTIMABLE',valor:null},interpretacion:'Tamaño bursátil, operativo y financiero separados; no determinan prima por sí solos'};
  const [runs]:any=await this.pool.query('SELECT r.id,r.template_code,r.valuation_method_family,r.estado,x.financial_state FROM valuation_run r JOIN valuation_execution x ON x.valuation_run_id=r.id WHERE r.empresa_id=? ORDER BY r.id DESC LIMIT 100',[id]);
  const incorporaciones:Incorporacion[]=[];
  const [frozen]:any=await this.pool.query(`SELECT x.valuation_run_id,x.input_hash,x.input_json FROM valuation_execution x JOIN valuation_run r ON r.id=x.valuation_run_id JOIN valuation_input_snapshot s ON s.id=r.input_snapshot_id WHERE r.empresa_id=? AND s.fecha_valoracion<=? ORDER BY s.fecha_valoracion DESC,x.valuation_run_id DESC LIMIT 1`,[id,asOf]);
  if(frozen.length&&latest){const original=parse(frozen[0].input_json),f=original.financials?.find((p:any)=>p.period_end_date===latest.periodo.fin);
   if(f&&original.currency===latest.moneda){const source={identificador:`valuation_execution:${frozen[0].valuation_run_id}:${frozen[0].input_hash}`,url:`http://127.0.0.1:3100/api/capital/runs/${frozen[0].valuation_run_id}`};
    const cash=indicadores.find(i=>i.id==='EFECTIVO')?.valor,debt=indicadores.find(i=>i.id==='DEUDA_BRUTA')?.valor,coverage=indicadores.find(i=>i.id==='COBERTURA_INTERESES')?.valor;
    if(cash!=null&&cash/1e6===original.cash_fy0&&f===original.financials[original.financials.length-1])incorporaciones.push({riesgo:'CAJA_PUENTE_EV_EQUITY',indicadores:['EFECTIVO'],componente:'EQUITY_VALUE',fuente:source,conocidoDesde:original.valuation_date,justificacion:'Mismo efectivo validado, fecha y moneda: caja incluida en puente EV a Equity. No autoriza una bonificación de WACC.',cobertura:'TOTAL'});
    if(debt!=null&&debt/1e6===original.gross_debt_fy0&&f===original.financials[original.financials.length-1])incorporaciones.push({riesgo:'DEUDA_PONDERACIONES',indicadores:['DEUDA_BRUTA'],componente:'ESTRUCTURA',fuente:source,conocidoDesde:original.valuation_date,justificacion:'El mismo saldo de deuda ya interviene en las ponderaciones; no certifica la cobertura de otros riesgos de financiación.',cobertura:'TOTAL'});
    if(coverage!=null&&coverage===original.interest_coverage&&original.synthetic_rating&&Number.isFinite(original.credit_spread))incorporaciones.push({riesgo:'COBERTURA_RATING_SPREAD',indicadores:['COBERTURA_INTERESES'],componente:'KD',fuente:source,conocidoDesde:original.valuation_date,justificacion:'Este indicador ya se utilizó para el rating/spread congelado; no añadir una segunda prima por el mismo canal crediticio.',cobertura:'TOTAL'});
   }
  }
  const [prices]:any=await this.pool.query('SELECT q.*,i.moneda FROM cotizacion_diaria q JOIN instrumento i ON i.id=q.instrumento_id WHERE i.empresa_id=? AND q.fecha<=?',[id,asOf]);
  const [shareCandidates]:any=await this.pool.query(`SELECT v.id evidence_id,v.evidence_json,p.importe,p.id record_id,f.fecha_fin_periodo,f.fecha_publicacion FROM pcv_verification_evidence v JOIN informe_financiero f ON f.id=v.informe_id JOIN partida_contable_valor p ON p.informe_id=f.id JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE f.empresa_id=? AND v.concept_code='ACCIONES_EN_CIRCULACION' AND t.concepto_estandar='ACCIONES_EN_CIRCULACION' AND f.fecha_publicacion<=? AND f.fecha_fin_periodo<=? AND v.outcome IN ('INSERTED','NULL_FILLED','VERIFIED_EXISTING') ORDER BY f.fecha_fin_periodo DESC,v.id DESC LIMIT 30`,[id,asOf,asOf]);
  const share=shareCandidates.find((s:any)=>{const p=parse(s.evidence_json),c=p.evidence?.candidate;return (p.evidence?.record_id===s.record_id||p.evidence?.record_ids?.includes(s.record_id))&&Number(c?.importe)===Number(s.importe)&&c?.evidence?.unit==='shares'&&['CommonStockSharesOutstanding','dei:EntityCommonStockSharesOutstanding'].includes(c?.concepto);});
  const [identity]:any=instruments.length?await this.pool.query(`SELECT * FROM capital_identity_evidence WHERE instrumento_id IN (?) AND status='VERIFIED' AND reference_date<=? ORDER BY reference_date DESC,id DESC LIMIT 1`,[instruments.map((i:any)=>i.id),asOf]):[[]];
  const ie=identity[0]?parse(identity[0].evidence_json):null,issued=ie?.official?.['已發行普通股數或TDR原股發行股數'];
  const sharesValue=share?Number(share.importe):issued?Number(issued):null;
  // Un certificado factual sólo procede del registro interno de evidencias. No se recibe del cliente.
  const rec=ie?.capitalizationReconciliation;
  const certified=rec?.policy==='CAPITALIZATION_RECONCILIATION_V2'&&rec.status==='APPROVED'
   &&rec.empresaId===id&&rec.instrumentoId===identity[0]?.instrumento_id&&rec.shareRecordId===share?.record_id
   &&rec.shareDate===share?.fecha_fin_periodo&&typeof rec.shareClass==='string'&&rec.shareClass.trim()
   &&typeof rec.approvedBy==='string'&&rec.approvedBy.trim()&&fechaValida(rec.approvedAt??'')&&rec.approvedAt<=asOf
   &&Array.isArray(rec.documents)&&rec.documents.length>0&&rec.documents.every((d:any)=>/^https:\/\//.test(d.url??'')&&/^[a-f0-9]{64}$/.test(d.sha256??''));
  const [certifiedPrices]:any=certified?await this.pool.query(`SELECT o.* FROM capital_daily_observation o WHERE o.id=? AND o.instrumento_id=? AND o.validation_status='VALID' AND o.session_date<=? AND NOT EXISTS(SELECT 1 FROM capital_daily_observation n WHERE n.instrumento_id=o.instrumento_id AND n.session_date=o.session_date AND n.source=o.source AND n.feed=o.feed AND n.revision>o.revision)`,[rec.priceObservationId,rec.instrumentoId,asOf]):[[]];
  const certifiedPrice=certifiedPrices[0],price=certifiedPrice??prices[0];
  const cap=capitalizacion({identidadVerificada:!!identity.length,claseVerificada:!!certified&&!!certifiedPrice,accionesEnCirculacion:sharesValue,tipoAcciones:share?'OUTSTANDING':issued?'ISSUED':'UNKNOWN',fechaAcciones:share?.fecha_fin_periodo??identity[0]?.reference_date??null,precio:price?Number(certifiedPrice?price.close_price:price.precio_cierre):null,fechaPrecio:certifiedPrice?.session_date??price?.fecha??null,moneda:share?parse(share.evidence_json).context?.currency:issued?'TWD':null,monedaPrecio:certifiedPrice?.currency??price?.moneda??null,corporateActionsConciliadas:!!certified&&rec.splitsReconciled===true,adrRatioConciliado:!!certified&&rec.adrRatioReconciled===true,clasesSinDuplicacion:instruments.length===1&&(!certified||rec.classesReconciled===true),publicacion:share?.fecha_publicacion??identity[0]?.reference_date??null,evidencia:[...(share?[`pcv:${share.record_id}:verification:${share.evidence_id}`]:[]),...(identity.length?[`identity:${identity[0].id}`]:[]),...(certified?[`price_observation:${rec.priceObservationId}`]:[])],bloqueo:blocked},asOf);
  const market=[];for(const i of instruments){const [feeds]:any=await this.pool.query('SELECT DISTINCT source,feed FROM capital_daily_observation WHERE instrumento_id=?',[i.id]);
   for(const f of feeds){const xs=await serie(this.pool as any,i.id,'2016-01-01',asOf,f.source,f.feed);const bars=xs.map((x:any)=>({id:x.id,fecha:x.session_date,cierre:Number(x.close_price),ajustado:x.adjusted_close==null?null:Number(x.adjusted_close),volumen:x.share_volume==null?null:Number(x.share_volume),importe:x.traded_value==null?null:Number(x.traded_value),tipoImporte:x.value_kind,moneda:x.currency,feed:x.feed,ajuste:x.adjustment_type,estado:x.validation_status}));
    const calendar=calendarioObservaciones(xs,asOf);
    market.push({instrumentoId:i.id,...f,precios:bars,ventanas:[90,180,252].map(w=>liquidezBursatil(bars,w,asOf,calendar))});}
  }
  const diagnostic={version:'G2_CAPITAL_v2.0.0',empresa:{...company,sectorEfectivo:sectorName,sectorEfectivoId:sectorId,familia:family,clasificacionResuelta:!!resolved},fecha:asOf,instrumentos:instruments,bloqueo:blocked??null,
   periodos:periods,periodoSeleccionado:latest?.periodo.fin??null,indicadores,tamano,capitalizacion:cap,bursatil:market,propuestas:indicadores.map(i=>evaluarIndicador(i,null,incorporaciones)),incorporaciones,runs,
   metodologias:METODOLOGIAS,advertencias:['Diagnóstico no equivale a prima autorizada','ERP total incluye riesgo país; no añadirlo de nuevo','Liquidez y tamaño requieren estimación residual conjunta'],
   cobertura:{validados:indicadores.filter(i=>i.valor!==null).length,total:indicadores.length,hayDatos:!!latest,scope:'Sólo informes disponibles en la copia de desarrollo; no representa toda la base operativa'}};
  return {...diagnostic,primasAutomaticas:calcularPrimasAutomaticas(diagnostic,await this.metodosPrecio())};
 }
 async metodosPrecio():Promise<MetodoPrecio[]>{
  const [rows]:any=await this.pool.query("SELECT * FROM capital_methodology WHERE status='APPROVED'");
  return rows.flatMap((r:any)=>{const m=parse(r.calibration_json);return m?.id===r.id&&m.version===r.version&&m.factor===r.factor&&m.estado===r.status&&m.evidenciaHash===r.evidence_hash?[m]:[];});
 }
 async comparables(id:number,asOf:string,periodEnd?:string,periodPolicy:'EXACT_PERIOD'|'ANNUAL_CLOSE_YEAR'='EXACT_PERIOD'){
  if(!['EXACT_PERIOD','ANNUAL_CLOSE_YEAR'].includes(periodPolicy))throw Error('Política de periodos desconocida');
  const target=await this.diagnostico(id,asOf,periodEnd);if(!target.empresa.clasificacionResuelta||target.bloqueo||!target.periodos[0])return {estado:'NO_ESTIMABLE',motivo:'Sector, identidad o periodo no conciliado',benchmarks:[]};
  const [candidates]:any=await this.pool.query(`SELECT e.id,EXISTS(SELECT 1 FROM informe_financiero f WHERE f.empresa_id=e.id AND f.tipo_periodo='ANUAL' AND f.fecha_publicacion<=?) has_reports FROM empresa e LEFT JOIN (SELECT empresa_id,sector_id,status,confidence,ROW_NUMBER() OVER(PARTITION BY empresa_id ORDER BY reference_date DESC,id DESC) rn FROM classification_evidence WHERE reference_date<=?) c ON c.empresa_id=e.id AND c.rn=1 WHERE (CASE WHEN c.status='ACCEPTED' AND c.confidence='HIGH' THEN c.sector_id ELSE e.sector_id END)=? AND e.pais_id=? ORDER BY e.id LIMIT 2001`,[asOf,asOf,target.empresa.sectorEfectivoId,target.empresa.pais_id]);
  if(candidates.length>2000)return {estado:'NO_ESTIMABLE',motivo:'Universo supera límite interactivo; ejecutar lote con checkpoint sin truncamiento silencioso',benchmarks:[]};
  const targetPeriod=target.periodos.find(p=>p.periodo.fin===target.periodoSeleccionado)!;
  const exclusions:{empresaId:string;motivo:string}[]=[];
  const peers:Awaited<ReturnType<DatosCapital['diagnostico']>>[]=[];for(const x of candidates){if(x.id===id)continue;if(!x.has_reports){exclusions.push({empresaId:String(x.id),motivo:'Sin informe anual disponible en esta copia y fecha'});continue;}let d=await this.diagnostico(x.id,asOf);
   const candidatePeriod=d.periodos.find(p=>p.periodo.fin.slice(0,4)===targetPeriod.periodo.fin.slice(0,4));
   if(candidatePeriod&&candidatePeriod.periodo.fin!==d.periodoSeleccionado)d=await this.diagnostico(x.id,asOf,candidatePeriod.periodo.fin);
   const chosen=d.periodos.find(p=>p.periodo.fin===d.periodoSeleccionado);
   if(!d.bloqueo&&chosen?.basis===targetPeriod.basis&&chosen?.moneda===targetPeriod.moneda&&d.empresa.familia===target.empresa.familia)peers.push(d);
   else exclusions.push({empresaId:String(x.id),motivo:d.bloqueo??'Familia, periodo o consolidación no comparable'});
  }
  const benchmarks=target.indicadores.map(i=>{
   const year=Number(i.periodoFin.slice(0,4));
   const rules={id:`sector:${target.empresa.sectorEfectivoId}:${i.id}:${asOf}:${periodPolicy}`,versionMetodologia:'COMPARABLES_V2',fecha:asOf,periodoInicio:periodPolicy==='EXACT_PERIOD'?i.periodoInicio:`${year-1}-01-01`,periodoFin:periodPolicy==='EXACT_PERIOD'?i.periodoFin:(`${year}-12-31`<asOf?`${year}-12-31`:asOf),indicador:i.id,unidad:i.unidad,moneda:i.moneda,
    filtros:{sector:i.empresa.sector,pais:i.empresa.pais,familia:i.empresa.familia},justificacionSeleccion:periodPolicy==='EXACT_PERIOD'?'Actividad, país, familia, periodo y consolidación iguales; tamaño no se filtra':'DESCRIPTIVO: informes anuales con cierre en el mismo año natural, moneda y consolidación. Fechas fiscales diferentes se conservan; no equivalen a TTM simultáneo ni a referencia de prima.',variablesControl:['ACTIVIDAD','PAIS','CONSOLIDACION','MONEDA'],variableEstudiada:i.factor,duracionesDiasAdmitidas:[350,351,352,353,354,355,356,357,358,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376,377,378,379,380,381]};
   const b=construirBenchmark(i.empresa,rules,peers.flatMap(d=>d.indicadores.filter(j=>j.id===i.id)));b.exclusiones.push(...exclusions);return {benchmark:b,propuesta:evaluarIndicador(i,b,target.incorporaciones),cobertura:{empresasCandidatasSinObjetivo:candidates.length-1,observacionesValidas:b.estadisticas?.n??0}};
  });const result={estado:'DESCRIPTIVO',periodPolicy,advertencias:periodPolicy==='ANNUAL_CLOSE_YEAR'?['Los cierres fiscales no son simultáneos. Esta cohorte descriptiva no autoriza primas ni elimina efectos de estacionalidad.']:[],universo:candidates.map((x:any)=>x.id),limitado:false,alcance:'Copia de desarrollo: conserva también empresas sin informes, con exclusión explícita',benchmarks};
  return result;
 }
 async guardar(kind:string,empresaId:number,fecha:string,payload:unknown,runId:number|null=null){
  const complete={...(payload as object),executionManifest:manifiestoCapital()};
  const text=JSON.stringify(complete),h=hash({kind,empresaId,fecha,payload:complete,runId});
  const [[version]]:any=await this.pool.query("SELECT id FROM model_version WHERE version='2.0.0-capital' ORDER BY id LIMIT 1");if(!version)throw Error('Nueva versión no registrada; aplicar migración 22 en desarrollo');
  const [r]:any=await this.pool.query('INSERT INTO capital_analysis(empresa_id,as_of,engine_version,kind,parent_run_id,payload_json,content_hash,model_version_id,payload_encoding_version) VALUES (?,?,?,?,?,?,?,?,2) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[empresaId,fecha,'2.0.0',kind,runId,text,h,version.id]);return r.insertId;
 }
}
