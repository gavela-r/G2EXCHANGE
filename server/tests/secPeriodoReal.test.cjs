// Regresión del error histórico de EE. UU.: un 10-K contiene el ejercicio corriente y los comparativos de 1-2
// ejercicios anteriores con la MISMA accesión. Sólo el hecho cuyo periodo coincide con el cierre del informe
// (fecha de fin, duración anual, formulario y accesión) puede convertirse en el PCV del ejercicio.
// Estructura de companyfacts de la SEC para el 10-K FY2025 de Apple (accesión 0000320193-25-000079). Los ingresos
// anuales coinciden con los candidatos SEC del registro de correcciones; el resto de importes es ilustrativo.
const test=require('node:test'),assert=require('node:assert/strict');
const {pcvCandidatosTag,pcvElegirMejorFact}=require('../dist/insercionDatos/insercionPartidaContable');
const ACC='0000320193-25-000079';
const informe={informe_id:20,empresa_id:1,ticker:'AAPL',tipo_periodo:'ANUAL',tipo_documento:'10-K',fecha_fin_periodo:'2025-09-27',fecha_publicacion:'2025-10-31',accession:ACC};
const fila=(start,end,val,extra={})=>({start,end,val,accn:ACC,fy:2025,fp:'FY',form:'10-K',filed:'2025-10-31',...extra});
const facts={facts:{'us-gaap':{
 RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[
  fila('2022-09-25','2023-09-30',383285000000),   // comparativo -2
  fila('2023-10-01','2024-09-28',391035000000),   // comparativo -1 (el valor que se guardó por error)
  fila('2024-09-29','2025-09-27',416161000000),   // ejercicio corriente
  fila('2025-06-29','2025-09-27',102466000000),   // trimestre dentro del 10-K
  fila('2024-09-29','2025-09-27',1,{accn:'0000320193-26-000001',form:'10-K/A'})  // otra presentación
 ]}},
 Assets:{units:{USD:[fila(null,'2024-09-28',364980000000),fila(null,'2025-09-27',359241000000)]}},
 EarningsPerShareDiluted:{units:{'USD/shares':[fila('2023-10-01','2024-09-28',6.08),fila('2024-09-29','2025-09-27',7.46)]}}
}}};

test('cuenta de resultados: sólo el ejercicio corriente (fin = cierre, ~365 días), nunca un comparativo ni un trimestre',()=>{
 const c=pcvCandidatosTag(facts,'RevenueFromContractWithCustomerExcludingAssessedTax',informe);
 assert.equal(c.length,4,'la otra accesión (10-K/A) se descarta');
 assert.equal(pcvElegirMejorFact(c,informe,'CUENTA_RESULTADOS').value,416161000000);
});
test('balance: hecho instantáneo con fecha = cierre del informe',()=>{
 assert.equal(pcvElegirMejorFact(pcvCandidatosTag(facts,'Assets',informe),informe,'BALANCE').value,359241000000);
});
test('EPS diluido del ejercicio corriente',()=>{
 assert.equal(pcvElegirMejorFact(pcvCandidatosTag(facts,'EarningsPerShareDiluted',informe),informe,'CUENTA_RESULTADOS').value,7.46);
});
test('si el 10-K sólo trae comparativos para ese tag, no se elige nada (null, no el comparativo)',()=>{
 const solo={facts:{'us-gaap':{GrossProfit:{units:{USD:[fila('2022-09-25','2023-09-30',169148000000),fila('2023-10-01','2024-09-28',180683000000)]}}}}};
 assert.equal(pcvElegirMejorFact(pcvCandidatosTag(solo,'GrossProfit',informe),informe,'CUENTA_RESULTADOS'),null);
});
test('informe sin fecha de cierre: no se elige ningún hecho',()=>{
 const sin={...informe,fecha_fin_periodo:null};
 assert.equal(pcvElegirMejorFact(pcvCandidatosTag(facts,'Assets',sin),sin,'BALANCE'),null);
});
