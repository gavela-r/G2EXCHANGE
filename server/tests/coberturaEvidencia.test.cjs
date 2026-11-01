const {test}=require('node:test'),assert=require('node:assert/strict'),{certificarInforme}=require('../scripts/pcv-cobertura-evidencia.cjs');
const report={id:1,codigo_iso:'US',fuente:'SEC_EDGAR',identificador_fuente:'SOURCE',fecha_fin_periodo:'2024-12-31'},row=(id,code,amount)=>({id,concepto_estandar:code,concepto:code,importe:amount,categoria:['ACTIVOS_TOTALES','PATRIMONIO_NETO','DEUDA_LARGO_PLAZO','DEUDA_CORTO_PLAZO'].includes(code)?'BALANCE':'CUENTA_RESULTADOS'});
const proof=r=>({concept_code:r.concepto_estandar,currency:'USD',basis:'consolidated',start:'2024-01-01',source_identifier:'SOURCE',document_identifier:'SOURCE',candidate_tag:r.concepto,candidate_amount:r.importe,unit:'USD',candidate_basis:'consolidated',candidate_start:r.categoria==='BALANCE'?null:'2024-01-01',end:report.fecha_fin_periodo,record_id:r.id});
test('Source-certified coverage requires current row IDs, normalized amounts and an unchanged formula result',()=>{
 const rows=[row(1,'BENEFICIO_NETO',10),row(2,'ACTIVOS_TOTALES',100)],evidence=rows.map(proof),kpis=[{kpi:'ROA',valor:10}];let c=certificarInforme(report,rows,kpis,evidence,rows.map(r=>r.concepto_estandar));assert.equal(c.pcv.size,2);assert.ok(c.kpi.has('ROA'));
 c=certificarInforme(report,[rows[0],{...rows[1],importe:200}],kpis,evidence,rows.map(r=>r.concepto_estandar));assert.equal(c.pcv.size,1);assert.equal(c.kpi.size,0);
 c=certificarInforme(report,rows,[{kpi:'ROA',valor:11}],evidence,rows.map(r=>r.concepto_estandar));assert.equal(c.kpi.size,0);
});
test('Inputs cannot be combined across documents, consolidation, currency or annual start',()=>{
 const rows=[row(1,'BENEFICIO_NETO',10),row(2,'ACTIVOS_TOTALES',100)],codes=rows.map(r=>r.concepto_estandar),e=rows.map(proof);
 for(const patch of [{document_identifier:'OTHER'},{basis:'standalone',candidate_basis:'standalone'},{start:'2024-02-01'}]){const c=certificarInforme(report,rows,[{kpi:'ROA',valor:10}],[e[0],{...e[1],...patch}],codes);assert.equal(c.kpi.size,0);}
 assert.equal(certificarInforme(report,rows,[],[{...e[0],currency:'EUR'}],codes).pcv.size,0);
});
test('An unverified stored debt component prevents certification of a partial debt total',()=>{
 const rows=[row(1,'DEUDA_LARGO_PLAZO',100),row(2,'DEUDA_CORTO_PLAZO',20)],c=certificarInforme(report,rows,[{kpi:'DEUDA_TOTAL',valor:100}],[proof(rows[0])],rows.map(r=>r.concepto_estandar));assert.equal(c.pcv.size,1);assert.equal(c.kpi.size,0);
});
