// El adaptador reconoce una corrección acreditada (migración 31) SÓLO por la prueba certificadora compatible con el
// valor vigente: CONFLICT_RESOLVED por sí solo nunca certifica. Sin MySQL; filas y evidencias con la forma real
// (verificador SEC, política INDEPENDENT_FIELDS_ATTESTED_INPUTS_V1).
const test=require('node:test'),assert=require('node:assert/strict');
const {observe}=require('../adapter.cjs');
const report={id:20,identificador_fuente:'0000320193-25-000079',fuente:'SEC_EDGAR',fecha_fin_periodo:'2025-09-27',fecha_publicacion:'2025-10-31'};
const context={currency:'USD',basis:'consolidated',start:'2024-09-29',identity:{cik:'0000320193'}};
const candidate={codigo:'INGRESOS',concepto:'RevenueFromContractWithCustomerExcludingAssessedTax',importe:416161000000,provider:'SEC_EDGAR',identifier:report.identificador_fuente,currency:'USD',basis:'consolidated',evidence:{cik:'0000320193',tag:'RevenueFromContractWithCustomerExcludingAssessedTax',unit:'USD',start:'2024-09-29',end:'2025-09-27',filed:'2025-10-31',comparative:false}};
const fila=importe=>({id:58119,concepto:'RevenueFromContractWithCustomerExcludingAssessedTax',importe,concepto_estandar:'INGRESOS',unidad_tipo:'MONEDA',alias_sec:'Revenues'});
const conflicto={id:1,concept_code:'INGRESOS',outcome:'CONFLICT_PRESERVED',evidence_hash:'a'.repeat(64),payload:{context,evidence:{candidate,originals:[{id:58119,importe:'391035000000.0000'}]}}};
const resuelto={id:3,concept_code:'INGRESOS',outcome:'CONFLICT_RESOLVED',evidence_hash:'c'.repeat(64),payload:{policy:'PCV_CONFLICT_RESOLUTION_V1',resolves:'a'.repeat(64),context,correction:{rule:'US_PERIODO_V1'}}};
const verificado={id:2,concept_code:'INGRESOS',outcome:'VERIFIED_EXISTING',evidence_hash:'b'.repeat(64),payload:{context,outcome:'VERIFIED_EXISTING',evidence:{candidate,record_ids:[58119]},correction:{rule:'US_PERIODO_V1',resolves:'a'.repeat(64)}}};

test('antes de corregir: el comparativo guardado (391.035 M) es CONFLICTIVO',()=>{
 assert.equal(observe(fila('391035000000.0000'),[conflicto],report,context).validation,'CONFLICTIVO');
});
test('después de corregir: valor = candidato SEC y prueba con candidato y contexto completos → VALIDADO',()=>{
 const o=observe(fila('416161000000.0000'),[verificado,resuelto,conflicto],report,context);
 assert.equal(o.validation,'VALIDADO');assert.equal(o.value,416161000000);assert.equal(o.verificationId,2);
});
test('CONFLICT_RESOLVED sin prueba certificadora no certifica',()=>{
 assert.notEqual(observe(fila('416161000000.0000'),[resuelto,conflicto],report,context).validation,'VALIDADO');
});
test('si el importe no se corrigió (otro proceso lo cambió), la prueba no se acepta',()=>{
 assert.notEqual(observe(fila('391035000000.0000'),[verificado,resuelto,conflicto],report,context).validation,'VALIDADO');
});
test('una prueba con otro documento, moneda o fecha no certifica',()=>{
 for(const c of [{...candidate,identifier:'0000320193-24-000123'},{...candidate,currency:'EUR'},{...candidate,evidence:{...candidate.evidence,end:'2024-09-28'}}]){
  const p={...verificado,payload:{...verificado.payload,evidence:{candidate:c,record_ids:[58119]}}};
  assert.notEqual(observe(fila('416161000000.0000'),[p,conflicto],report,context).validation,'VALIDADO');
 }
});
