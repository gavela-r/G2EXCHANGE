import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {valorar} from '../src/modelo';
import {calcularWacc,pctMysql} from '../src/wacc';
import {construirPrimas} from '../src/riesgo';
import type {ModeloInput} from '../src/tipos';
const root=path.resolve(__dirname,'../../');
const demo=JSON.parse(fs.readFileSync(path.join(root,'ejemplos/DEMO_NO_REAL.json'),'utf8')) as ModeloInput;
test('MySQL 4.46 => 0.0446',()=>assert.equal(pctMysql(4.46,'erp'),0.0446));
test('Ke CAPM y pesos E/(E+D)',()=>{
 const p=construirPrimas(demo);
 const w=calcularWacc(demo,p.ajustes);
 assert.ok(Math.abs(w[1].ke-(.0468+2.1258*.0446))<1e-12);
 assert.ok(Math.abs(w[1].peso_patrimonio-0.8)<1e-12);
 assert.ok(Math.abs(w[1].peso_deuda-0.2)<1e-12);
 assert.ok(Math.abs(w[1].wacc_financiero-(w[1].ke*0.8+w[1].kd_neto*0.2))<1e-12);
 assert.ok(w[0].spread_credito>w[1].spread_credito);
 assert.ok(w[1].spread_credito>w[2].spread_credito);
});
test('DCF demo 3 escenarios, no recomendacion aprobada',()=>{
 const r=valorar(demo,{root});assert.equal(r.wacc_scenarios.length,3);assert.equal(r.valuations.length,3);
 assert.ok(r.valuations.every(x=>Number.isFinite(x.fair_value)));
 assert.equal(r.validation_status,'REVIEW');assert.equal(r.premium_methodology,'DRAFT_POLICY');
});
test('Prohibidos mercados sin Rf/ERP aprobado',()=>{
 assert.throws(()=>valorar({...demo,market:'HK'} as any,{root}),/Solo US/);
});
test('Fallo seguro cuando falta prueba de riesgo',()=>{
 assert.throws(()=>valorar({...demo,risk_inputs:undefined},{root}),/Faltan risk_inputs/);
});
test('Se evita doble contabilizacion de riesgo país',()=>{
 const r=valorar({...demo, ...( {country_risk_premium:0.05} as any)},{root});
 const ke=r.wacc_scenarios[1].ke;
 assert.equal(ke,demo.risk_free_rate+demo.sector_beta*demo.equity_risk_premium);
});
test('16 modelos sectoriales: no faltan configuraciones y bloquean cuando faltan datos específicos',()=>{
 for(let n=1;n<=16;n++){
  const code=String(n).padStart(2,'0');
  const result=valorar({...demo,template_code:code},{root});
  assert.equal(result.wacc_scenarios.length,3);
  if(['13','14','15'].includes(code)) {
    assert.equal(result.validation_status,'BLOCKED');
    assert.equal(result.valuations[1].fair_value,null);
  } else {
    assert.equal(result.validation_status,'REVIEW');
    assert.ok(result.valuations[1].fair_value!==null);
  }
 }
});
test('DDM necesita flujos de caja del accionista; WACC no usado como descuento',()=>{
 const x=valorar({...demo,template_code:'13',sector_specific:{next_dividends_millions:500,long_term_dividend_growth:.02}},{root});
 assert.ok(x.valuations[1].fair_value && x.valuations[1].fair_value>0);
 assert.equal(x.valuations[1].metodo,'DDM_GORDON_TS');
});
