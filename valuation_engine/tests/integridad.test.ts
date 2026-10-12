import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {valorar} from '../src/modelo';
import type {ModeloInput} from '../src/tipos';
const root=path.resolve(__dirname,'../../');
const fixture=():ModeloInput=>JSON.parse(fs.readFileSync(path.join(root,'ejemplos/DEMO_NO_REAL.json'),'utf8'));
test('WACC <= g bloquea terminal; no ocultar denominador inválido',()=>{
  const i=fixture();i.risk_free_rate=0.001;i.equity_risk_premium=0.001;delete i.risk_inputs;
  i.premium_methodology='SIMULATION_ONLY';i.wacc_adjustments=Object.fromEntries(['CONSERVATIVE','BASE','OPTIMISTIC'].map(s=>[s,Object.fromEntries(['prima_iliquidez','prima_tamano','prima_concentracion_clientes','otros_ajustes_wacc'].map(f=>[f,{value:0,source:'TEST',reference_date:i.valuation_date}]))])) as any;
  assert.throws(()=>valorar(i,{root}),/WACC debe superar/);
});
test('TTM anualizado participa en crecimiento: corrige tasa duplicada',()=>{
  const i=fixture();i.financials.forEach((f,n)=>{f.period_end_date=`${f.fiscal_year}-12-31`;});
  i.ttm_financials={...i.financials[3],fiscal_year:2026,period_end_date:'2026-06-30',revenue:i.financials[3].revenue*1.1};
  const r=valorar(i,{root});const f=i.financials;
  const annual=Math.pow(1.1,365.25/181)-1;
  const expected=(f[2].revenue/f[1].revenue-1)*0.2+(f[3].revenue/f[2].revenue-1)*0.3+annual*0.5;
  assert.ok(Math.abs(r.valuations[1].weighted_growth!-expected)<1e-12);
});
test('Replay utiliza configuración sectorial congelada',()=>{
  const i=fixture();i.sector_config_snapshot=JSON.parse(fs.readFileSync(path.join(root,'generator/sector_configs/03_semiconductores_hardware.json'),'utf8'));
  const a=valorar(i,{root});const b=valorar(i,{root:path.join(root,'directorio-inexistente')});
  assert.deepEqual(a,b);
});
