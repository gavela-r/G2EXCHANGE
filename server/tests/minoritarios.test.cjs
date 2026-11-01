// Participaciones no dominantes FY0: derivadas sólo de patrimonio total y de la dominante del mismo informe; nunca cero supuesto.
const test=require('node:test'),assert=require('node:assert/strict');
const {minoritariosDesdePatrimonio:m}=require('../dist/src/valoracion/datos');
const r=(concepto,importe,concepto_estandar='PATRIMONIO_NETO')=>({concepto,importe,concepto_estandar});
test('total − dominante con un valor por perímetro',()=>{
 assert.deepEqual(m([r('StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','1200'),r('StockholdersEquity','1000'),r('Revenues','9','INGRESOS')]),{valor:200,etiquetas:['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','StockholdersEquity']});
 assert.equal(m([r('jppfs_cor:NetAssets',500),r('jpcrp_cor:NetAssetsSummaryOfBusinessResults',500),r('jppfs_cor:EquityAttributableToOwnersOfParent',480)]).valor,20);
});
test('sin ambos perímetros, contradictorio o total < dominante → null (no 0)',()=>{
 assert.equal(m([r('StockholdersEquity',1000)]),null);
 assert.equal(m([r('NetAssets',500),r('NetAssets',510),r('StockholdersEquity',400)]),null);
 assert.equal(m([r('NetAssets',300),r('StockholdersEquity',400)]),null);
 assert.equal(m([r('NetAssets',null),r('StockholdersEquity',400)]),null);
});
test('emisor extranjero 20-F bloqueado sin ratio ADS; 10-K y 40-F no',()=>{
 const {bloqueoEmisorExtranjero:b}=require('../dist/src/valoracion/datos');
 assert.match(b(['10-K','20-F','20-F','20-F']),/ratio de representación/);assert.match(b(['20-F/A:COMPARATIVE']),/20-F/);
 assert.equal(b(['10-K','10-K/A','10-K','10-K']),null);assert.equal(b(['40-F','40-F','40-F','40-F']),null);
});
test('ROE del backend: sólo con perímetros conocidos e iguales; recuperadores registran el perímetro (kpiValoresDeFilas)',()=>{
 const K=require('../dist/insercionDatos/insercionKPIInformeFinanciero');
 const f=(c,concepto,importe)=>({concepto_estandar:c,concepto,importe,signo_esperado:'MIXTO'});
 const roe=filas=>K.kpiCalcularInforme(1,K.kpiValoresDeFilas(filas,'SEC_EDGAR').valores).some(k=>k.kpi==='ROE');
 const base=[f('INGRESOS','Revenues',1000),f('ACTIVOS_TOTALES','Assets',5000)];
 assert.equal(roe([...base,f('BENEFICIO_NETO','NetIncomeLoss',100),f('PATRIMONIO_NETO','StockholdersEquity',800)]),true);
 assert.equal(roe([...base,f('BENEFICIO_NETO','NetIncomeLoss',100),f('PATRIMONIO_NETO','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',900)]),false);
 assert.equal(roe([...base,f('BENEFICIO_NETO','IncomeLossFromContinuingOperations',100),f('PATRIMONIO_NETO','StockholdersEquity',800)]),false);
 assert.equal(K.kpiCalcularInforme(1,{BENEFICIO_NETO:100,PATRIMONIO_NETO:800,INGRESOS:1000}).some(k=>k.kpi==='ROE'),false,'sin perímetro registrado no hay ROE');
});
