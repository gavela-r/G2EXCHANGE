import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {valorar} from '../src/modelo';
import {escribirExcel} from '../src/reportes/excel';
import {escribirPdf} from '../src/reportes/pdf';
import type {ModeloInput} from '../src/tipos';
const root=path.resolve(__dirname,'../../');
test('Se escriben PDF y Excel legibles con los datos TS, sin MySQL',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'ejemplos/DEMO_NO_REAL.json'),'utf8')) as ModeloInput;
  const result=valorar(data,{root});
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'g2v15-'));
  try{
    const pdf=path.join(tmp,'demo.pdf'),xlsx=path.join(tmp,'demo.xlsx');
    escribirPdf(result,pdf);escribirExcel(data,result,xlsx,root);
    assert.equal(fs.readFileSync(pdf).subarray(0,5).toString(),'%PDF-');
    const book=XLSX.readFile(xlsx,{cellFormula:true});
    assert.ok(book.SheetNames.includes('14_MOTOR_TS'));
    assert.equal(book.Sheets['14_MOTOR_TS']['B9'].v,result.wacc_scenarios[0].ke);
    assert.equal(book.Sheets['11_OUTPUT_API']['B29'].v,result.wacc_scenarios[2].wacc_ajustado);
    assert.equal(book.Sheets['10_RESULTADO']['C4'].v,result.valuations[1].fair_value);
  } finally {fs.rmSync(tmp,{force:true,recursive:true});}
});
