import {test} from 'node:test';
import assert from 'node:assert/strict';
import {construirPrimas} from '../src/riesgo';
import type {ModeloInput} from '../src/tipos';

test('SIMULATION_ONLY identifica las primas como no aprobadas',()=>{
  const escenarios=['CONSERVATIVE','BASE','OPTIMISTIC'];
  const factores=['prima_iliquidez','prima_tamano','prima_concentracion_clientes','otros_ajustes_wacc'];
  const ajustes=Object.fromEntries(escenarios.map(s=>[
    s,Object.fromEntries(factores.map(f=>[
      f,{value:0,source:'SIMULACION_TEST',reference_date:'2026-10-10'}
    ]))
  ]));
  const resultado=construirPrimas({
    premium_methodology:'SIMULATION_ONLY',
    wacc_adjustments:ajustes
  } as unknown as ModeloInput);
  assert.equal(resultado.method,'SIMULATION_ONLY');
  assert.match(resultado.warnings.join(' '),/NO APROBADA/);
});

test('SIMULATION_ONLY no admite ajustes sin evidencia',()=>{
  assert.throws(()=>construirPrimas({
    premium_methodology:'SIMULATION_ONLY',
    wacc_adjustments:{
      BASE:{prima_iliquidez:{value:0,source:'',reference_date:'2026-10-10'}}
    }
  } as unknown as ModeloInput));
});
