import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {valorar} from '../src/modelo';
import type {ModeloInput} from '../src/tipos';

const root=path.resolve(__dirname,'../../');
const demo=JSON.parse(
  fs.readFileSync(path.join(root,'ejemplos/DEMO_NO_REAL.json'),'utf8')
) as ModeloInput;

function copia(): ModeloInput {
  return JSON.parse(JSON.stringify(demo)) as ModeloInput;
}

test('CAPEX: admite tres ejercicios validos',()=>{
  const input=copia();
  const years=input.financials;
  assert.ok(years.length>=4);
  years[0].capex=undefined;
  const result=valorar(input,{root});
  assert.ok(Number.isFinite(result.valuations[1].fair_value));
});

test('CAPEX: cero sospechoso equivale a dato ausente',()=>{
  const ausente=copia();
  const cero=copia();

  ausente.financials[0].capex=undefined;
  cero.financials[0].capex=0;

  assert.ok(cero.financials[0].revenue>0);
  assert.ok(cero.financials[0].da>0);

  const a=valorar(ausente,{root});
  const b=valorar(cero,{root});

  assert.equal(
    a.valuations[1].fair_value,
    b.valuations[1].fair_value
  );
});

test('CAPEX: mayor inversion reduce el valor razonable',()=>{
  const bajo=copia();
  const alto=copia();

  for(const f of bajo.financials){
    f.capex=f.revenue*0.02;
  }

  for(const f of alto.financials){
    f.capex=f.revenue*0.12;
  }

  const a=valorar(bajo,{root});
  const b=valorar(alto,{root});

  assert.ok(
    (a.valuations[1].fair_value ?? -Infinity) > (b.valuations[1].fair_value ?? Infinity)
  );
});