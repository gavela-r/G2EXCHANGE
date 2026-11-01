// SELECCION_OBSERVACIONES_V1 y perímetro de ROE. Sin MySQL.
const test=require('node:test'),assert=require('node:assert/strict');
const {seleccionarObservaciones:sel,perimetroDeEtiqueta:per}=require('../dist/src/pcv/seleccionObservaciones.js');
const K=require('../dist/insercionDatos/insercionKPIInformeFinanciero.js');
const f=(id,c,tag,v)=>({id,concepto_estandar:c,concepto:tag,importe:v});

test('duplicados exactos: se conservan, no hay contradicción',()=>{
 const r=sel([f(1,'INGRESOS','NetSales','100'),f(2,'INGRESOS','NetSales','100.0000')]);assert.equal(r.filas.length,2);assert.equal(r.sinResolver.length,0);
});
test('evidencia primaria decide entre etiquetas distintas (nunca el valor)',()=>{
 const filas=[f(1,'BENEFICIO_NETO','NetIncomeLoss','90'),f(2,'BENEFICIO_NETO','ProfitLoss','95')];
 const r=sel(filas,new Map([['BENEFICIO_NETO',new Set([1])]]));assert.deepEqual(r.filas.map(x=>x.id),[1]);assert.equal(r.resueltas[0].criterio,'EVIDENCIA_PRIMARIA');
 const r2=sel(filas,new Map([['BENEFICIO_NETO',new Set([2])]]));assert.deepEqual(r2.filas.map(x=>x.id),[2],'decide la evidencia, no el mayor ni el menor');
});
test('sin evidencia: el estado principal prevalece sobre el resumen del mismo documento y las extensiones propias',()=>{
 const r=sel([f(1,'INGRESOS','jppfs_cor:NetSales','8587744000'),f(2,'INGRESOS','jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults','7549710000')]);
 assert.deepEqual(r.filas.map(x=>x.id),[1]);assert.equal(r.resueltas[0].criterio,'ETIQUETA_ESTADO_PRINCIPAL');
 const e=sel([f(1,'GASTO_INTERESES','jppfs_cor:InterestExpensesNOE','12702000000'),f(2,'GASTO_INTERESES','jpcrp030000-asr_E04788-000:CapitalCostsAndInterestExpenses','7746000000')]);assert.deepEqual(e.filas.map(x=>x.id),[1]);
});
test('contradicción entre etiquetas principales: sin resolver y fuera del cálculo (sólo ese concepto)',()=>{
 const r=sel([f(1,'CUENTAS_COBRAR','jppfs_cor:AccountsReceivableTrade','2763000000'),f(2,'CUENTAS_COBRAR','jppfs_cor:NotesAndAccountsReceivableTradeAndContractAssets','4972000000'),f(3,'INGRESOS','jppfs_cor:NetSales','1')]);
 assert.deepEqual(r.filas.map(x=>x.id),[3]);assert.equal(r.sinResolver[0].concepto,'CUENTAS_COBRAR');assert.equal(r.sinResolver[0].motivo,'ETIQUETAS_PRINCIPALES_CONTRADICTORIAS');
});
test('evidencia primaria contradictoria no se resuelve',()=>{
 const r=sel([f(1,'EBIT','a','1'),f(2,'EBIT','b','2')],new Map([['EBIT',new Set([1,2])]]));assert.equal(r.sinResolver[0].motivo,'EVIDENCIA_PRIMARIA_CONTRADICTORIA');
});
test('movimientos y reversiones no hacen contradictoria una celda de saldo o de D&A',()=>{
 const r=sel([f(1,'INVENTARIOS','jpcrp_cor:WriteDownsOfInventories','3243000'),f(2,'INVENTARIOS','jppfs_cor:Merchandise','2498019000')]);assert.equal(r.sinResolver.length,0);assert.deepEqual(r.filas.map(x=>x.id),[2]);
 const d=sel([f(1,'DEPRECIACION_AMORTIZACION','jppfs_cor:ReversalOfReserveForSpecialDepreciation','-318000'),f(2,'DEPRECIACION_AMORTIZACION','jppfs_cor:DepreciationAndAmortizationOpeCF','120003000')]);assert.deepEqual(d.filas.map(x=>x.id),[2]);
});
test('perímetro por etiqueta: dominante frente a total',()=>{
 assert.equal(per('BENEFICIO_NETO','NetIncomeLoss'),'DOMINANTE');assert.equal(per('BENEFICIO_NETO','ifrs-full:ProfitLossAttributableToOwnersOfParent'),'DOMINANTE');
 assert.equal(per('BENEFICIO_NETO','jppfs_cor:ProfitLoss'),'TOTAL');assert.equal(per('BENEFICIO_NETO','ProfitLoss'),'TOTAL');
 assert.equal(per('PATRIMONIO_NETO','StockholdersEquity'),'DOMINANTE');assert.equal(per('PATRIMONIO_NETO','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'),'TOTAL');assert.equal(per('PATRIMONIO_NETO','jppfs_cor:NetAssets'),'TOTAL');
});
test('ROE sólo con perímetros conocidos e iguales: no con dominante/total ni con perímetro desconocido',()=>{
 const base={INGRESOS:1000,BENEFICIO_NETO:100,PATRIMONIO_NETO:500,ACTIVOS_TOTALES:2000};
 const a={...base};K.kpiRegistrarPerimetros(a,{beneficio:'DOMINANTE',patrimonio:'TOTAL'});assert.ok(!K.kpiCalcularInforme(1,a).some(k=>k.kpi==='ROE'));
 const b={...base};K.kpiRegistrarPerimetros(b,{beneficio:'TOTAL',patrimonio:'TOTAL'});const roe=K.kpiCalcularInforme(1,b).find(k=>k.kpi==='ROE');assert.ok(roe);assert.ok(Math.abs(roe.valor-20)<1e-9||Math.abs(roe.valor-0.2)<1e-9);
 assert.ok(!K.kpiCalcularInforme(1,{...base}).some(k=>k.kpi==='ROE'),'sin perímetro conocido no hay ROE (V2)');
 const c={...base};K.kpiRegistrarPerimetros(c,{beneficio:'DOMINANTE',patrimonio:null});assert.ok(!K.kpiCalcularInforme(1,c).some(k=>k.kpi==='ROE'),'un perímetro desconocido basta para no calcularlo');
});
