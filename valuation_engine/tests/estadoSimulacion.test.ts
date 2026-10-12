import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {valorar} from '../src/modelo';
import type {ModeloInput} from '../src/tipos';

test('DCF completo: SIMULATION_ONLY permanece en revision',()=>{
  const root=path.resolve(__dirname,'../../');
  const input=JSON.parse(
    fs.readFileSync(path.join(root,'ejemplos/DEMO_NO_REAL.json'),'utf8')
  ) as ModeloInput;

  const factores=['prima_iliquidez','prima_tamano','prima_concentracion_clientes','otros_ajustes_wacc'];
  const escenarios=['CONSERVATIVE','BASE','OPTIMISTIC'];

  input.premium_methodology='SIMULATION_ONLY';
  input.wacc_adjustments=Object.fromEntries(
    escenarios.map(s=>[
      s,Object.fromEntries(
        factores.map(f=>[
          f,{value:0,source:'SIMULACION_TEST',reference_date:input.valuation_date}
        ])
      )
    ])
  ) as ModeloInput['wacc_adjustments'];

  const resultado=valorar(input,{root});

  assert.equal(resultado.status,'REVIEW');
  assert.notEqual(resultado.validation_status,'APPROVED');
  assert.match(JSON.stringify(resultado),/SIMULACION NO APROBADA/);
});
