import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {valorar} from '../src/modelo';
import type {ModeloInput} from '../src/tipos';

const root=path.resolve(__dirname,'../../');
const demo=JSON.parse(fs.readFileSync(path.join(root,'ejemplos/DEMO_NO_REAL.json'),'utf8')) as ModeloInput;

test('Hipotesis por empresa: modifican valoracion sin alterar plantilla',()=>{
  const original=valorar(demo,{root});
  const modificado=valorar({...demo,company_assumptions:{
    terminal_ebit_margin:{value:0.40,source:'SIMULACION_TEST',reference_date:'2026-10-10'}
  }},{root});
  assert.notEqual(modificado.valuations[1].fair_value,original.valuations[1].fair_value);
  assert.deepEqual(valorar(demo,{root}).valuations,original.valuations);
});

test('Hipotesis por empresa: fuente obligatoria',()=>{
  assert.throws(()=>valorar({...demo,company_assumptions:{
    terminal_ebit_margin:{value:0.40,source:'',reference_date:'2026-10-10'}
  }},{root}),/fuente y fecha obligatorias/);
});
