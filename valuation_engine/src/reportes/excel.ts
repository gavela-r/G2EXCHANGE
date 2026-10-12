import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { ESCENARIOS, FACTORES, type ModeloInput, type Resultado } from '../tipos';

function set(ws:XLSX.WorkSheet,address:string,value:string|number|null):void{
  if(value===null)return;
  const cell=ws[address]||({} as XLSX.CellObject);
  cell.v=value;cell.t=typeof value==='number'?'n':'s';delete cell.f;
  ws[address]=cell;
}
function fmtPct(ws:XLSX.WorkSheet,address:string){if(ws[address])ws[address].z='0.00%';}
const rawFields=['fiscal_year','revenue','ebitda','ebit','net_income','taxes_paid','da','capex','change_nwc','operating_cash_flow','free_cash_flow','cash','gross_debt','equity','total_assets','total_liabilities','dividends','diluted_shares'];
export function escribirExcel(data:ModeloInput,r:Resultado,output:string,root:string):void{
  const p=fs.readdirSync(path.join(root,'templates')).filter(f=>f.startsWith(`Template_${data.template_code}_`)&&f.endsWith('.xlsx'));
  if(p.length!==1)throw new Error(`Plantilla ${data.template_code}: se esperaba 1 archivo, hay ${p.length}`);
  const book=XLSX.readFile(path.join(root,'templates',p[0]),{cellStyles:true,cellNF:true,cellFormula:true});
  const con=book.Sheets['01_CONTROL'],raw=book.Sheets['02_DATOS_RAW'],wa=book.Sheets['07_WACC'];
  if(!con||!raw||!wa) throw new Error('Plantilla incompatible: faltan hojas esenciales');
  const values:Record<string,string|number|undefined>={
    company_id:data.company_id.toString(),instrument_id:data.instrument_id.toString(),company_name:data.company_name,ticker:data.ticker,
    market:data.market,currency:data.currency,valuation_date:data.valuation_date,price_per_share:data.price_per_share,
    diluted_shares:r.wacc_scenarios[0].equity_market_value_millions/data.price_per_share,
    gross_debt_fy0:data.gross_debt_fy0,cash_fy0:data.cash_fy0,minority_interest_fy0:data.minority_interest_fy0??0,
    template_code:data.template_code,model_version:'1.5.0',data_version:data.data_version??'v1.5',confidence:data.confidence??'MEDIUM',
    valuation_run_id:String(data.valuation_run_id),input_snapshot_id:String(data.input_snapshot_id),
    reporting_currency:data.reporting_currency,valuation_currency:data.valuation_currency,fx_rate_used:data.fx_rate_used,
    risk_free_rate:data.risk_free_rate,equity_risk_premium:data.equity_risk_premium,tax_rate:data.tax_rate,
    sector_beta:data.sector_beta,synthetic_rating:data.synthetic_rating??'NOT_PROVIDED',
    interest_coverage:data.interest_coverage??0,credit_spread:data.credit_spread,
    spread_credito_optimista:data.spread_credito_optimista,spread_credito_pesimista:data.spread_credito_pesimista,
    terminal_growth_max:data.terminal_growth_max,premium_policy_status:'REVIEW',country_risk_premium:0,size_premium:0
  };
  for(let row=4;row<=46;row++){
    const key=String(con[`A${row}`]?.v??'');const v=values[key];
    if(v!==undefined)set(con,`B${row}`,v);
  }
  for(let idx=0;idx<data.financials.length;idx++){
    const year=data.financials[idx],col='BCDE'[idx];
    for(let j=0;j<rawFields.length;j++){
      const v=(year as unknown as Record<string,number|undefined>)[rawFields[j]];
      if(v!==undefined)set(raw,`${col}${j+4}`,v);
    }
  }
  for(const [idx,scenario] of ESCENARIOS.entries()){
    const col=['H','J','L'][idx],w=r.wacc_scenarios[idx];
    for(const [j,factor] of FACTORES.entries()){
      const addr=`${col}${j+30}`;set(wa,addr,w.ajustes[factor].value);fmtPct(wa,addr);
    }
  }
  // Legacy sheets may have spreadsheet-engine-only formulas. TS outputs are authoritative.
  // Freeze executive and API outputs as explicit numbers: no reliance on Excel calculation.
  const exec=book.Sheets['10_RESULTADO'];
  const api=book.Sheets['11_OUTPUT_API'];
  if(!exec||!api)throw new Error('Faltan las hojas de resultados de la plantilla');
  for(const [idx,s] of ESCENARIOS.entries()){
    const col='BCD'[idx],v=r.valuations[idx];
    set(exec,`${col}4`,v.fair_value);set(exec,`${col}6`,v.max_buy_price);set(exec,`${col}7`,data.price_per_share);
    set(exec,`${col}8`,v.upside);set(exec,`${col}9`,v.decision);set(exec,`${col}10`,data.confidence??'MEDIUM');
    set(exec,`${col}11`,r.validation_status);
    fmtPct(exec,`${col}8`);
  }
  const am:Record<string,string|number|null>={
    template_code:data.template_code,model_version:'1.5.0',data_version:data.data_version??'v1.5',
    company_id:String(data.company_id),instrument_id:String(data.instrument_id),valuation_run_id:String(data.valuation_run_id),
    input_snapshot_id:String(data.input_snapshot_id),valuation_date:data.valuation_date,current_price:data.price_per_share,
    confidence:data.confidence??'MEDIUM',validation_status:r.validation_status,synthetic_rating:data.synthetic_rating??'NOT_PROVIDED',credit_spread:data.credit_spread,
    ke_capm:r.wacc_scenarios[0].ke,terminal_growth:r.valuations[1].terminal_growth
  };
  for(const [idx,s] of ESCENARIOS.entries()){
    const v=r.valuations[idx],w=r.wacc_scenarios[idx],suffix=s.toLowerCase();
    am[`fair_value_${suffix}`]=v.fair_value;am[`max_buy_price_${suffix}`]=v.max_buy_price;
    am[`upside_${suffix}`]=v.upside;am[`decision_${suffix}`]=v.decision;
    am[`wacc_${suffix}`]=w.wacc_ajustado;am[`wacc_financiero_${suffix}`]=w.wacc_financiero;
    am[`wacc_ajustado_${suffix}`]=w.wacc_ajustado;
    am[`spread_credito_${suffix}`]=w.spread_credito;
    for(const factor of FACTORES){
      const legacyName=factor==='prima_iliquidez'?'liquidez':factor==='prima_tamano'?'tamano':factor==='prima_concentracion_clientes'?'concentracion_clientes':'otros_ajustes';
      am[`${legacyName}_${suffix}`]=w.ajustes[factor].value;
    }
  }
  for(let row=4;row<=55;row++){
    const key=String(api[`A${row}`]?.v??'');
    if(Object.prototype.hasOwnProperty.call(am,key)) set(api,`B${row}`,am[key]);
  }
  // Audit trail of ALL news signals (accepted or rejected); no silent external updates.
  const nw=book.Sheets['05_AJUSTES_NOTICIAS'];
  if(nw){
    for(let i=0;i<(data.news_events||[]).length && i<20;i++){
      const ev=data.news_events![i];const row=i+4;
      set(nw,`A${row}`,String(ev.signal_id));set(nw,`B${row}`,ev.variable_code);
      set(nw,`C${row}`,ev.scenario??'BASE');
      set(nw,`E${row}`,ev.proposed_adjustment);set(nw,`Q${row}`,ev.source_url);
      set(nw,`O${row}`,r.news_audit[i]?.aplicado?'YES':'NO');
    }
  }
  // Readable TS-only audit sheet. No formulas needed to report calculated WACC.
  const table:(string|number)[][]=[
    ['G2EXCHANGE v1.5 | DATOS CALCULADOS CON TYPESCRIPT'],
    [`Empresa: ${data.company_name}`,`Mercado: ${data.market}`,`Fecha: ${data.valuation_date}`],
    ['IMPORTANTE: los resultados de esta hoja, 10_RESULTADO, 11_OUTPUT_API y el JSON proceden del motor TS; 08/09 son fórmulas legadas para contraste.'],
    [],['Indicador','CONSERVATIVE','BASE','OPTIMISTIC'],
    ['Rf',...r.wacc_scenarios.map(x=>x.rf)],['Beta',...r.wacc_scenarios.map(x=>x.beta)],
    ['ERP total Damodaran',...r.wacc_scenarios.map(x=>x.erp)],['Ke CAPM',...r.wacc_scenarios.map(x=>x.ke)],
    ['Spread de crédito',...r.wacc_scenarios.map(x=>x.spread_credito)],
    ['Kd antes de impuestos',...r.wacc_scenarios.map(x=>x.kd)],
    ['Kd después de impuestos',...r.wacc_scenarios.map(x=>x.kd_neto)],
    ['Peso patrimonio',...r.wacc_scenarios.map(x=>x.peso_patrimonio)],
    ['Peso deuda',...r.wacc_scenarios.map(x=>x.peso_deuda)],
    ['WACC financiero',...r.wacc_scenarios.map(x=>x.wacc_financiero)],
    ...FACTORES.map(f=>[f,...r.wacc_scenarios.map(x=>x.ajustes[f].value)] as (string|number)[]),
    ['WACC AJUSTADO',...r.wacc_scenarios.map(x=>x.wacc_ajustado)],
    ['Valor razonable / acción',...r.valuations.map(x=>x.fair_value??'NO DISPONIBLE')],
    ['Precio máximo compra',...r.valuations.map(x=>x.max_buy_price??'NO DISPONIBLE')],
    ['Upside',...r.valuations.map(x=>x.upside??'NO DISPONIBLE')],
    ['Decisión',...r.valuations.map(x=>x.decision)],
    ['Estado',r.validation_status,r.validation_status,r.validation_status],
    ['Método',...r.valuations.map(x=>x.metodo)],
    ['FUENTE DE VERDAD: informe JSON, versión calculadora TS 1.5.0; ERP incluye riesgo país, no sumar de nuevo.']
  ];
  const audit=XLSX.utils.aoa_to_sheet(table);
  audit['!cols']=[{wch:37},{wch:25},{wch:25},{wch:25}];
  for(let row=6;row<=20;row++) for(const col of 'BCD') if(audit[`${col}${row}`]?.t==='n')audit[`${col}${row}`].z=row===7?'0.0000':'0.00%';
  audit['!merges']=[{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:2,c:0},e:{r:2,c:3}}];
  book.Sheets['14_MOTOR_TS']=audit; if(!book.SheetNames.includes('14_MOTOR_TS'))book.SheetNames.push('14_MOTOR_TS');
  book.Workbook=book.Workbook||{};(book.Workbook as any).CalcPr={calcMode:'auto',fullCalcOnLoad:true};
  fs.mkdirSync(path.dirname(output),{recursive:true});
  XLSX.writeFile(book,output,{bookType:'xlsx',cellStyles:true});
}
