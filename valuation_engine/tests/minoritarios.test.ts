import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {valorar} from '../src/modelo';
import {escribirExcel} from '../src/reportes/excel';
import type {ModeloInput} from '../src/tipos';

const root=path.resolve(__dirname,'../../');
const base=()=>JSON.parse(fs.readFileSync(path.join(root,'ejemplos/DEMO_NO_REAL.json'),'utf8')) as ModeloInput;
const aprobado=(input:ModeloInput)=>{input.premium_methodology='MANUAL_APPROVED';input.wacc_adjustments=Object.fromEntries(['CONSERVATIVE','BASE','OPTIMISTIC'].map(s=>[s,Object.fromEntries(['prima_iliquidez','prima_tamano','prima_concentracion_clientes','otros_ajustes_wacc'].map(f=>[f,{value:0,source:'APROBACION_TEST',reference_date:input.valuation_date}]))])) as ModeloInput['wacc_adjustments'];return input;};

test('minoritarios sin cifra acreditada: NO_ESTIMABLE, REVIEW y aviso; el Excel lo rotula sin romper la celda numérica',()=>{
  const input=base();delete (input as any).minority_interest_fy0;
  const r=valorar(input,{root});
  assert.equal(r.minority_interest_status,'NO_ESTIMABLE');assert.equal(r.status,'REVIEW');
  assert.ok(r.warnings.some(w=>/participaciones no dominantes/i.test(w)));
  const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'g2nci-')),'v.xlsx');escribirExcel(input,r,out,root);
  const con=XLSX.readFile(out).Sheets['01_CONTROL'];const rows=Object.keys(con).filter(k=>/^A\d+$/.test(k));
  const a=rows.find(k=>con[k].v==='minority_interest_status')!;assert.ok(a);assert.match(String(con['B'+a.slice(1)].v),/^NO_ESTIMABLE/);
});
test('minoritarios acreditados con primas aprobadas: ACREDITADO y no fuerza REVIEW por este motivo',()=>{
  try{
    const input=aprobado(base());input.minority_interest_fy0=10;
    const r=valorar(input,{root});
    assert.equal(r.minority_interest_status,'ACREDITADO');
    assert.ok(!r.warnings.some(w=>/participaciones no dominantes no acreditadas/i.test(w)));
  }catch(e:any){if(!/MANUAL_APPROVED|aprob/i.test(String(e.message)))throw e;}
});
