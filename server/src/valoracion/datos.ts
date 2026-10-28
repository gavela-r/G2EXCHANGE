import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ModeloInput, Evidencia, Ajustes, Resultado } from 'g2-motor/tipos';
import { cargarCalidad, cargarMotor, rutaMotor, manifiestoMotor } from './rutas';
export { manifiestoMotor } from './rutas';
import { resolverConfiguracionFinanciera } from './motorServicio';
import { obtenerMapeoSector } from './mapeoSectores';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {clasificacionVigente,perfilPorCapitalizacion} from './evidencia';

export type Db = Pick<PoolConnection,'query'>;
export type PerfilRating = 'GRANDE_NO_FINANCIERA'|'PEQUEÑA_RIESGOSA'|'FINANCIERA';
export class Pendiente extends Error {
  constructor(public code:string, message:string) { super(message); }
}
export interface Instrumento { instrumento_id:number; empresa_id:number; sector_id:number; pais_id:number; mercado_id:number; ticker:string; isin:string|null; moneda:string; nombre_empresa:string; codigo_iso:string; nombre_sector:string; }
export interface HipotesisInstrumento {
  source:string; reference_date:string;
  sector_id?:number;
  perfil_rating?:PerfilRating;
  reporting_currency?:string;
  sector_beta?:Evidencia;
  risk_inputs?:ModeloInput['risk_inputs'];
  wacc_adjustments?:Ajustes;
  premium_methodology?:ModeloInput['premium_methodology'];
  company_assumptions?:ModeloInput['company_assumptions'];
  sector_specific?:ModeloInput['sector_specific'];
}
export interface Preparado {
  instrumento:Instrumento; input:ModeloInput; hash:string;
  versiones:number[]; costeCapitalId:number; ratingId:number;
  engineVersion:string; manifestHash:string; trace:Record<string,unknown>;
}
export function serializar(value:unknown):string {
  function normalize(v:any):any {
    if(typeof v==='number' && !Number.isFinite(v)) throw new Error('Huella contiene número no finito');
    if(Array.isArray(v))return v.map(normalize);
    if(v && typeof v==='object')return Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,normalize(v[k])]));
    return v;
  }
  return JSON.stringify(normalize(value));
}
export function huella(value:unknown):string { return crypto.createHash('sha256').update(serializar(value)).digest('hex'); }
export function primasCero(fecha:string):Ajustes {
  return Object.fromEntries(['CONSERVATIVE','BASE','OPTIMISTIC'].map(s=>[s,Object.fromEntries(['prima_iliquidez','prima_tamano','prima_concentracion_clientes','otros_ajustes_wacc'].map(f=>[f,{value:0,source:'SYSTEM_DEFAULT_ZERO_V1',reference_date:fecha}]))])) as Ajustes;
}
export interface Partida { concepto_estandar:string; concepto:string; importe:unknown; signo_esperado:string; alias_sec?:string; alias_edinet?:string; alias_finmind?:string; }
export function normalizarPartidas(rows:Partida[],fuente:string):{valores:Record<string,number>; calidad:Record<string,unknown>; advertencias:string[]} {
  const {numeroDato,conceptoDAValido}=cargarCalidad();
  const valores:Record<string,number>={},calidad:Record<string,unknown>={},advertencias:string[]=[];
  for(const r of rows) {
    const k=r.concepto_estandar.toUpperCase();
    if(['INVENTARIOS','CUENTAS_COBRAR','CUENTAS_PAGAR','EFECTIVO','DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO','PATRIMONIO_NETO','ACTIVOS_TOTALES','PASIVOS_TOTALES'].includes(k) && /writedown|reversal|increase|decrease|changein|impairment/i.test(r.concepto)) {
      advertencias.push(`Concepto de movimiento incompatible con saldo ${k}: ${r.concepto}`);continue;
    }
    if(k==='DEPRECIACION_AMORTIZACION' && !conceptoDAValido(r.concepto)) {
      calidad[k]={estado:'INVALIDO',source:r.concepto,reason:'Reserva/reversión/deterioro no representa D&A'};
      advertencias.push(`D&A incompatible: ${r.concepto}`);continue;
    }
    let v=numeroDato(r.importe,k,true);if(v===undefined)continue;
    if(k==='DEPRECIACION_AMORTIZACION' && v<0) {calidad[k]={estado:'INVALIDO',source:r.concepto,value:v};advertencias.push('D&A negativo sin convención validada');continue;}
    // Known cash-flow purchase/payment aliases carry source sign; never normalize other concepts indiscriminately.
    if((k==='CAPEX'||k==='DIVIDENDOS_PAGADOS')&&v<0) {
      const alias=fuente==='EDINET'?r.alias_edinet:fuente==='SEC_EDGAR'?r.alias_sec:r.alias_finmind;
      const local=r.concepto.split(':').pop()!.toLowerCase();
      const salidaComplementaria=(k==='CAPEX'&&['EDINET_DB:purchase_of_ppe','FINDATAENGINE:capital_expenditures','ALPHAVANTAGE:capitalExpenditures'].includes(r.concepto))||(k==='DIVIDENDOS_PAGADOS'&&['EDINET_DB:cash_dividends_paid','FINDATAENGINE:dividends_paid','ALPHAVANTAGE:dividendPayout'].includes(r.concepto));
      if(!salidaComplementaria&&(!alias || local!==alias.toLowerCase())) {calidad[k]={estado:'INVALIDO',reason:'Signo de salida sin alias exacto verificable',source:r.concepto};continue;}
      v=-v;calidad[k]={estado:'RECONSTRUIDO',rule:'SALIDA_CAJA_ALIAS_EXACTO',source:r.concepto};
    }
    if(valores[k]!==undefined && valores[k]!==v) throw new Pendiente('TAXONOMIA_AMBIGUA',`${k}: importes incompatibles para el mismo informe`);
    valores[k]=v;calidad[k]??={estado:v===0?'CERO_REAL':'REAL',source:r.concepto};
  }
  const reconstruir=(k:string,deps:string[],fn:(...v:number[])=>number)=>{
    if(valores[k]===undefined&&deps.every(d=>valores[d]!==undefined)){valores[k]=fn(...deps.map(d=>valores[d]));calidad[k]={estado:'RECONSTRUIDO',deps};}
  };
  reconstruir('EBITDA',['EBIT','DEPRECIACION_AMORTIZACION'],(a,b)=>a+b);
  reconstruir('BENEFICIO_ANTES_IMPUESTOS',['BENEFICIO_NETO','IMPUESTO_BENEFICIOS'],(a,b)=>a+b);
  reconstruir('DEUDA_TOTAL',['DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO'],(a,b)=>a+b);
  reconstruir('CAPITAL_CIRCULANTE_OPERATIVO',['INVENTARIOS','CUENTAS_COBRAR','CUENTAS_PAGAR'],(a,b,c)=>a+b-c);
  reconstruir('FCF',['FLUJO_CAJA_OPERATIVO','CAPEX'],(a,b)=>a-b);
  return {valores,calidad,advertencias};
}
export async function resolverRating(db:Db,ebit:number,intereses:number,perfil:PerfilRating,fecha:string) {
  if(!Number.isFinite(ebit)||!Number.isFinite(intereses)||intereses===0) throw new Pendiente('RATING_PENDIENTE','Cobertura no calculable: no se fabrica cobertura 999');
  const coverage=ebit/Math.abs(intereses);
  const [rows]=await db.query<RowDataPacket[]>(`SELECT * FROM rating_sintetico WHERE perfil_empresa=? AND activo=1 AND ? > conbertura_interes_min_exclusiva AND ? <= cobertura_interes_max_inclusiva AND fecha_datos_mercado <= ?`,[perfil,coverage,coverage,fecha]);
  if(rows.length!==1) throw new Pendiente('RATING_AMBIGUO',`Rating ${perfil}: ${rows.length} coincidencias`);
  return {row:rows[0],coverage};
}
export async function prepararInstrumento(db:Db,id:number,asOf:string,hip?:HipotesisInstrumento):Promise<Preparado> {
  const {fechaCivil,numeroDato}=cargarCalidad();fechaCivil(asOf);
  if(hip && (!hip.source?.trim()||!hip.reference_date))throw new Pendiente('EVIDENCIA_PENDIENTE','Hipótesis de instrumento sin fuente/fecha');
  if(hip){fechaCivil(hip.reference_date);if(hip.reference_date>asOf)throw new Pendiente('EVIDENCIA_FUTURA','Hipótesis posterior a valoración');}
  const [irs]=await db.query<RowDataPacket[]>(`SELECT i.id instrumento_id,i.empresa_id,i.mercado_id,i.ticker,i.isin,i.moneda,e.nombre_empresa,e.sector_id,e.pais_id,p.codigo_iso,s.nombre_sector FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id JOIN sector s ON s.id=e.sector_id WHERE i.id=?`,[id]);
  if(irs.length!==1)throw new Pendiente('IDENTIDAD_PENDIENTE','Instrumento inexistente');
  const i=irs[0] as Instrumento & RowDataPacket;
  const classification=hip?.sector_id?undefined:await clasificacionVigente(db,i.empresa_id,asOf);
  const sectorResuelto=hip?.sector_id??classification?.sector_id??i.sector_id;
  if(!hip?.sector_id&&!classification&&obtenerMapeoSector(i.sector_id).nombre.toLowerCase()!==i.nombre_sector.toLowerCase())throw new Pendiente('MAPEO_INCONSISTENTE','ID sector no corresponde al nombre verificado');
  const cfg=resolverConfiguracionFinanciera(sectorResuelto);
  if(!['US','JP','TW'].includes(i.codigo_iso))throw new Pendiente('MERCADO_NO_HABILITADO',i.codigo_iso);
  if(!/^[A-Z]{3}$/.test(i.moneda))throw new Pendiente('MONEDA_PENDIENTE',String(i.moneda));
  const [prices]=await db.query<RowDataPacket[]>('SELECT precio_cierre,fecha FROM cotizacion_diaria WHERE instrumento_id=? AND fecha<=? ORDER BY fecha DESC,id DESC LIMIT 1',[id,asOf]);
  if(prices.length!==1)throw new Pendiente('PRECIO_PENDIENTE','Sin precio del instrumento');
  const [reports]=await db.query<RowDataPacket[]>(`SELECT x.* FROM (SELECT inf.*,ROW_NUMBER() OVER(PARTITION BY YEAR(inf.fecha_fin_periodo) ORDER BY inf.fecha_fin_periodo DESC,inf.id DESC) rn FROM informe_financiero inf WHERE inf.empresa_id=? AND inf.tipo_periodo='ANUAL' AND inf.fecha_publicacion<=? AND inf.fecha_fin_periodo<=? AND EXISTS(SELECT 1 FROM partida_contable_valor pc WHERE pc.informe_id=inf.id)) x WHERE rn=1 ORDER BY fecha_fin_periodo DESC LIMIT 4`,[i.empresa_id,asOf,asOf]);
  if(reports.length!==4)throw new Pendiente('EJERCICIOS_PENDIENTES',`Ejercicios ${reports.length}/4`);
  reports.reverse();
  const financieras:ModeloInput['financials']=[],versiones:number[]=[],traces:unknown[]=[];
  let ultimo:Record<string,number>={};
  let coberturaObservada:{ebit:number;intereses:number;informe_id:number;fecha:string}|undefined;
  for(const r of reports) {
    const [vs]=await db.query<RowDataPacket[]>('SELECT id,moneda,hash_inputs,fecha_fin_periodo FROM valuation_input_version WHERE empresa_id=? AND informe_id=? ORDER BY id DESC LIMIT 1',[i.empresa_id,r.id]);
    if(vs.length!==1)throw new Pendiente('VERSION_PENDIENTE',`Informe ${r.id}: falta versión financiera`);
    const moneda=hip?.reporting_currency??String(vs[0].moneda??'');
    if(moneda!==i.moneda)throw new Pendiente('FX_PENDIENTE',`Informe ${r.id}: ${moneda}/${i.moneda}; no existe conversión verificada`);
    // SEC accepts multiple currencies. Its source name alone is not proof of currency.
    const [parts]=await db.query<RowDataPacket[]>(`SELECT pc.concepto,pc.importe,tc.concepto_estandar,tc.signo_esperado,tc.alias_sec,tc.alias_edinet,tc.alias_finmind FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id=? ORDER BY pc.id`,[r.id]);
    const n=normalizarPartidas(parts as (RowDataPacket&Partida)[],r.fuente);const p=n.valores;
    if(p.EBIT!==undefined&&p.GASTO_INTERESES!==undefined&&p.GASTO_INTERESES!==0)coberturaObservada={ebit:p.EBIT,intereses:p.GASTO_INTERESES,informe_id:r.id,fecha:fechaCivil(r.fecha_fin_periodo)};
    const need=(k:string)=>{if(p[k]===undefined)throw new Pendiente('DATO_PENDIENTE',`Informe ${r.id}: ${k} ausente/incompatible`);return p[k];};
    const f:ModeloInput['financials'][number]={fiscal_year:Number(fechaCivil(r.fecha_fin_periodo).slice(0,4)),period_end_date:fechaCivil(r.fecha_fin_periodo),revenue:need('INGRESOS'),ebit:need('EBIT'),da:need('DEPRECIACION_AMORTIZACION'),capex:p.CAPEX,nwc_balance:p.CAPITAL_CIRCULANTE_OPERATIVO,ebitda:p.EBITDA,net_income:p.BENEFICIO_NETO,taxes_paid:p.IMPUESTO_BENEFICIOS,operating_cash_flow:p.FLUJO_CAJA_OPERATIVO,free_cash_flow:p.FCF};
    // Model monetary quantities and share counts are millions. Only configured source imports in UNITS are accepted.
    for(const k of Object.keys(f))if(!['fiscal_year','period_end_date'].includes(k)&&(f as any)[k]!==undefined)(f as any)[k]/=1e6;
    if(financieras.length && f.fiscal_year!==financieras[financieras.length-1].fiscal_year+1)throw new Pendiente('PERIODOS_INCONSISTENTES','Cierres anuales no consecutivos');
    const prev=financieras[financieras.length-1];if(prev?.nwc_balance!==undefined&&f.nwc_balance!==undefined)f.change_nwc=f.nwc_balance-prev.nwc_balance;
    financieras.push(f);versiones.push(Number(vs[0].id));ultimo=p;
    const [kpis]=await db.query<RowDataPacket[]>('SELECT kpi,unidad,valor,nivel_confianza FROM kpi_financiero_informe WHERE informe_id=? ORDER BY kpi,id',[r.id]);
    traces.push({informe_id:r.id,fecha:fechaCivil(r.fecha_fin_periodo),fuente:r.fuente,version_id:vs[0].id,hash_version:vs[0].hash_inputs,fecha_version:vs[0].fecha_fin_periodo,calidad:n.calidad,advertencias:n.advertencias,kpis});
  }
  const need0=(k:string)=>{if(ultimo[k]===undefined)throw new Pendiente('DATO_PENDIENTE',`${k} FY0 ausente`);return ultimo[k];};
  const automaticProfile=perfilPorCapitalizacion(i.codigo_iso,i.moneda,cfg.valuationMethodFamily,Number(prices[0].precio_cierre),ultimo.ACCIONES_EN_CIRCULACION);
  const perfil=hip?.perfil_rating??automaticProfile?.profile;
  if(!perfil)throw new Pendiente('PERFIL_RATING_PENDIENTE','Falta evidencia del perfil de tamaño/riesgo; no se elige un tramo arbitrario');
  if(['BANK','INSURANCE'].includes(cfg.valuationMethodFamily)!==(perfil==='FINANCIERA'))throw new Pendiente('PERFIL_INCOMPATIBLE','Perfil rating no corresponde a metodología');
  if(!coberturaObservada)throw new Pendiente('RATING_PENDIENTE','No existe cobertura de intereses verificable en los cuatro informes');
  const rating=await resolverRating(db,coberturaObservada.ebit,coberturaObservada.intereses,perfil,asOf);
  const [countries]=await db.query<RowDataPacket[]>('SELECT * FROM pais WHERE id=?',[i.pais_id]);const country=countries[0];
  if(hip?.sector_id && hip.sector_id!==i.sector_id&&!hip.sector_beta)throw new Pendiente('BETA_PENDIENTE','Sector alternativo requiere beta específica; no reutilizar beta de N/A');
  const [sectors]=await db.query<RowDataPacket[]>('SELECT sensibilidad_al_mercado FROM sector WHERE id=?',[sectorResuelto]);
  if(sectors.length!==1)throw new Pendiente('SECTOR_PENDIENTE','Sector resuelto inexistente');
  const [cc]=await db.query<RowDataPacket[]>('SELECT id,fecha_calculo FROM coste_capital_referencia WHERE pais_id=? AND sector_id=? AND fecha_calculo<=? ORDER BY fecha_calculo DESC,id DESC LIMIT 1',[i.pais_id,sectorResuelto,asOf]);
  if(cc.length!==1)throw new Pendiente('REFERENCIA_PENDIENTE','Sin referencia país/sector a fecha de valoración');
  const pct=(v:unknown,n:string)=>{const x=numeroDato(v,n)!;if(x<0||x>100)throw new Pendiente('PARAMETRO_INVALIDO',n);return x/100;};
  for(const k of ['fecha_publicacion_bono10','fecha_actualizacion_prima_mercado'])if(country[k] && fechaCivil(country[k])>asOf)throw new Pendiente('PARAMETRO_FUTURO',k);
  const input:ModeloInput={company_id:i.empresa_id,instrument_id:id,company_name:i.nombre_empresa,ticker:i.ticker,market:i.codigo_iso as ModeloInput['market'],template_code:cfg.templateCode,valuation_date:asOf,valuation_run_id:'DRY_RUN',input_snapshot_id:'DRY_RUN',currency:i.moneda,reporting_currency:i.moneda,valuation_currency:i.moneda,fx_rate_used:1,price_per_share:numeroDato(prices[0].precio_cierre,'precio')!,diluted_shares:need0('ACCIONES_EN_CIRCULACION')/1e6,gross_debt_fy0:need0('DEUDA_TOTAL')/1e6,cash_fy0:need0('EFECTIVO')/1e6,risk_free_rate:pct(country.interes_bono_10_ano,'RF'),equity_risk_premium:pct(country.prima_riesgo_mercado,'ERP'),tax_rate:pct(country.tasa_impositiva,'impuestos'),sector_beta:numeroDato(sectors[0].sensibilidad_al_mercado,'beta')!,credit_spread:pct(rating.row.spread_credito_base,'spread'),spread_credito_optimista:pct(rating.row.spread_credito_optimista,'spread optimista'),spread_credito_pesimista:pct(rating.row.spread_credito_pesimista,'spread conservador'),interest_coverage:rating.coverage,synthetic_rating:rating.row.rating_estimado,terminal_growth_max:0.025,financials:financieras,confidence:'LOW',discount_convention:'YEAR_END',company_assumptions:hip?.company_assumptions,sector_specific:hip?.sector_specific,risk_inputs:hip?.risk_inputs,wacc_adjustments:hip?.wacc_adjustments,premium_methodology:hip?.premium_methodology};
  if(hip?.sector_beta){if(!hip.sector_beta.source?.trim()||hip.sector_beta.reference_date>asOf||!Number.isFinite(hip.sector_beta.value)||hip.sector_beta.value<0.01||hip.sector_beta.value>5)throw new Pendiente('BETA_INVALIDA','Beta sin evidencia o fuera de límites');fechaCivil(hip.sector_beta.reference_date);input.sector_beta=hip.sector_beta.value;}
  if(input.wacc_adjustments&&!input.premium_methodology)throw new Pendiente('METODOLOGIA_PENDIENTE','Ajustes de riesgo existentes requieren metodología explícita');
  if(!input.wacc_adjustments&&!input.risk_inputs){input.wacc_adjustments=primasCero('2026-10-12');input.premium_methodology='SYSTEM_DEFAULT_ZERO';}
  if(ultimo.BENEFICIO_ANTES_IMPUESTOS>0 && ultimo.IMPUESTO_BENEFICIOS>=0 && ultimo.IMPUESTO_BENEFICIOS<=ultimo.BENEFICIO_ANTES_IMPUESTOS)input.effective_tax_rate_fy0={value:ultimo.IMPUESTO_BENEFICIOS/ultimo.BENEFICIO_ANTES_IMPUESTOS,source:`INFORME_${reports[3].fuente}:${reports[3].id}`,reference_date:fechaCivil(reports[3].fecha_fin_periodo)};
  const cfgFile=fs.readdirSync(rutaMotor('generator/sector_configs')).find(f=>f.startsWith(cfg.templateCode+'_'))!;
  input.sector_config_snapshot=JSON.parse(fs.readFileSync(rutaMotor('generator/sector_configs',cfgFile),'utf8'));
  input.risk_policy_snapshot=JSON.parse(fs.readFileSync(rutaMotor('config/risk_policy_v15.json'),'utf8'));
  input.data_quality_warnings=[
    'HIPOTESIS DEL SISTEMA: acciones en circulación como proxy del denominador; dilución completa, splits y ADRs pendientes de verificación.',
    'Moneda financiera basada en metadata VIV; unidades originales pendientes de verificación. Sin conversión FX.',
    `Perfil de rating: ${hip?.perfil_rating?hip.source:automaticProfile?.criterion}; requiere revisión de su evidencia.`
  ];
  if(coberturaObservada.informe_id!==reports[3].id)input.data_quality_warnings.push(`Cobertura de intereses tomada del informe ${coberturaObservada.informe_id} (${coberturaObservada.fecha}), anterior al último cierre; no se fabrican intereses ausentes.`);
  const manifest=manifiestoMotor();
  try { cargarMotor().validarEntrada(input); }
  catch(e:any) { throw new Pendiente('INPUT_FINANCIERO_INVALIDO',e.message); }
  const trace={identity:i,classification:classification??null,financials:traces,quote:prices[0],country,sector:{id:sectorResuelto,...sectors[0]},coste_capital:cc[0],rating:rating.row,rating_profile:hip?.perfil_rating?{profile:perfil,source:hip.source,date:hip.reference_date}:automaticProfile,coverage_source:coberturaObservada,hypotheses:hip??null,policy:'NORMALIZACION_V1_UNITS',family:cfg.valuationMethodFamily,share_basis:'ACCIONES_EN_CIRCULACION: proxy de denominador, no prueba de dilución completa',currency_basis:'VIV_MONEDA: verificar unidades originales antes de aprobación'};
  const {valuation_run_id,input_snapshot_id,valuation_date,...semantic}=input;
  const hash=huella({input:semantic,trace,engine:manifest});input.data_version=hash;
  return {instrumento:i,input,hash,versiones,costeCapitalId:Number(cc[0].id),ratingId:Number(rating.row.id),engineVersion:manifest.version,manifestHash:manifest.hash,trace};
}
export function validarResultado(input:ModeloInput,r:Resultado):'COMPLETA_CON_ADVERTENCIAS'|'BLOQUEADA' {
  if(r.valuation_run_id!==input.valuation_run_id||r.input_snapshot_id!==input.input_snapshot_id||r.ticker!==input.ticker||r.currency!==input.currency||r.template_code!==input.template_code)throw new Error('Identidad del resultado incompatible');
  const scenarios=['CONSERVATIVE','BASE','OPTIMISTIC'];
  if(r.valuations.length!==3||r.wacc_scenarios.length!==3||scenarios.some(s=>r.valuations.filter(v=>v.escenario===s).length!==1||r.wacc_scenarios.filter(w=>w.escenario===s).length!==1))throw new Error('Se requieren exactamente tres escenarios únicos');
  for(const v of r.valuations) {
    const w=r.wacc_scenarios.find(w=>w.escenario===v.escenario)!;
    if(!Number.isFinite(v.wacc)||v.wacc<=0||Math.abs(v.wacc-w.wacc_ajustado)>1e-12)throw new Error('WACC resultado inconsistente');
    for(const k of ['fair_value','max_buy_price','upside','terminal_growth','valor_empresa_millones','valor_patrimonio_millones'] as const)if(v[k]!==null&&v[k]!==undefined&&!Number.isFinite(v[k]))throw new Error(`Resultado no finito: ${k}`);
    if(v.proyeccion_fcff.some(x=>!Number.isFinite(x)))throw new Error('FCFF no finito');
  }
  if(r.validation_status==='BLOCKED'||r.valuations.some(v=>v.fair_value===null||v.decision==='DATA_PENDING'))return 'BLOQUEADA';
  if(r.valuations.some(v=>v.fair_value!<0||v.max_buy_price!<0))throw new Error('Precio calculado negativo');
  return 'COMPLETA_CON_ADVERTENCIAS';
}
