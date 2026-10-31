// Reglas versionadas del registro de correcciones (tools/diagnostico_conflictos.cjs). Sin MySQL.
const test=require('node:test'),assert=require('node:assert/strict');
const {clasificar,pruebaSec,decidir,REGLAS}=require('../tools/diagnostico_conflictos.cjs');
const celda=(o)=>({informe:1,empresa:7,year:2024,fin:'2024-09-28',concept:'INGRESOS',cand:{importe:391035e6,tag:'RevenueFromContractWithCustomerExcludingAssessedTax',accn:'A-24',end:'2024-09-28',comparative:false},origs:[],...o});

test('reglas con versión fechada',()=>{assert.deepEqual(Object.keys(REGLAS).sort(),['JP_RESUMEN_MISMO_DOC_V1','JP_SIGNO_CANONICO_V1','US_PERIODO_V1']);});

test('US: original igual al candidato primario de 2 ejercicios antes → corrección por periodo',()=>{
 const c=celda({origs:[{importe:394328e6,tag:'RevenueFromContractWithCustomerExcludingAssessedTax'}]});
 const lookup=new Map([['7|INGRESOS',new Map([['2022-09-24',new Set([394328e6])],['2024-09-28',new Set([391035e6])]])]]);
 assert.equal(clasificar(c,lookup),'ORIGINAL_DE_OTRO_PERIODO');assert.deepEqual(c.offsets,[2]);
 assert.deepEqual(decidir('US',c),{regla:'US_PERIODO_V1',valor:391035e6,accion:'CORREGIR_VALOR_A_CANDIDATO_PRIMARIO'});
});

test('US: coincidencia con un cierre lejano (7 años) o posterior NO se corrige',()=>{
 const lejos=celda({origs:[{importe:5,tag:'X'}]});const lk=new Map([['7|INGRESOS',new Map([['2017-09-30',new Set([5])]])]]);
 assert.equal(clasificar(lejos,lk),'ORIGINAL_DE_OTRO_PERIODO');assert.equal(decidir('US',lejos),null);
 const posterior=celda({origs:[{importe:9,tag:'X'}]});const lk2=new Map([['7|INGRESOS',new Map([['2025-09-27',new Set([9])]])]]);
 clasificar(posterior,lk2);assert.equal(decidir('US',posterior),null);
});

test('US: prueba companyfacts — comparativo del mismo 10-K frente a reexpresión del mismo cierre',()=>{
 const facts=v=>({facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:v}}}}});
 const c=celda({origs:[{importe:394328e6,tag:'RevenueFromContractWithCustomerExcludingAssessedTax'}]});
 const p=pruebaSec(c,facts([{end:'2022-09-24',val:394328e6,form:'10-K',accn:'A-24'},{end:'2024-09-28',val:391035e6,form:'10-K',accn:'A-24'}]));
 assert.equal(p.causa,'SEC_OTRO_PERIODO');assert.equal(p.prueba[0].mismaPresentacion,true);
 c.causa='SIN_EXPLICAR';c.sec=p;assert.equal(decidir('US',c).regla,'US_PERIODO_V1');
 const r=celda({origs:[{importe:390000e6,tag:'RevenueFromContractWithCustomerExcludingAssessedTax'}]});
 r.sec=pruebaSec(r,facts([{end:'2024-09-28',val:390000e6,form:'10-K',accn:'A-23R'}]));
 assert.equal(r.sec.causa,'SEC_MISMO_PERIODO_OTRA_PRESENTACION');assert.equal(decidir('US',r),null,'una reexpresión exige decidir la versión: no se corrige');
 const q=celda({origs:[{importe:1,tag:'X'}]});assert.equal(pruebaSec(q,facts([{end:'2022-09-24',val:1,form:'10-Q',accn:'Q'}])).causa,null,'sólo 10-K');
});

test('US: el candidato debe tener contexto verificado (fin = cierre y no comparativo)',()=>{
 const c=celda({origs:[{importe:394328e6,tag:'T'}],otroPeriodo:true,offsets:[2]});c.cand={...c.cand,comparative:true};assert.equal(decidir('US',c),null);
 const d=celda({origs:[{importe:394328e6,tag:'T'}],otroPeriodo:true,offsets:[2]});d.cand={...d.cand,end:'2024-06-30'};assert.equal(decidir('US',d),null);
});

const jp=(o)=>celda({fin:'2024-01-20',cand:{importe:213370e6,tag:'jppfs_cor:NetSales',accn:'S100',end:'2024-01-20',comparative:false},...o});
test('JP_RESUMEN_MISMO_DOC_V1: fila exacta + misma cifra en «SummaryOfBusinessResults» del mismo documento',()=>{
 const c=jp({origs:[{importe:213370e6,tag:'jppfs_cor:NetSales'},{importe:213370e6,tag:'jpcrp_cor:NetSalesSummaryOfBusinessResults'}]});
 assert.equal(decidir('JP',c).regla,'JP_RESUMEN_MISMO_DOC_V1');
});
test('JP: sin fila exacta, otro concepto o importe distinto → sigue en conflicto',()=>{
 assert.equal(decidir('JP',jp({origs:[{importe:213370e6,tag:'jpcrp_cor:NetSalesSummaryOfBusinessResults'}]})),null,'falta la fila atestada exacta');
 assert.equal(decidir('JP',jp({origs:[{importe:213370e6,tag:'jppfs_cor:NetSales'},{importe:213000e6,tag:'jpcrp_cor:NetSalesSummaryOfBusinessResults'}]})),null,'resumen redondeado: no idéntico');
 const caja=jp({concept:'EFECTIVO',cand:{importe:3796236e3,tag:'jppfs_cor:CashAndCashEquivalents',end:'2024-01-20',comparative:false},origs:[{importe:3796236e3,tag:'jppfs_cor:CashAndDeposits'}]});
 assert.equal(decidir('JP',caja),null,'«現金及び預金» y «現金及び現金同等物» son conceptos distintos aunque coincida el importe');
});
test('JP_SIGNO_CANONICO_V1: CAPEX con el mismo tag y signo opuesto; no aplica a otros conceptos',()=>{
 const t='jppfs_cor:PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssetsInvCF';
 const c=jp({concept:'CAPEX',cand:{importe:10912e6,tag:t,end:'2024-01-20',comparative:false},origs:[{importe:-10912e6,tag:t}]});
 assert.deepEqual(decidir('JP',c),{regla:'JP_SIGNO_CANONICO_V1',valor:10912e6,accion:'NORMALIZAR_SIGNO_CANONICO'});
 const n=jp({concept:'BENEFICIO_NETO',cand:{importe:5,tag:'jppfs_cor:ProfitLoss',end:'2024-01-20',comparative:false},origs:[{importe:-5,tag:'jppfs_cor:ProfitLoss'}]});
 assert.equal(decidir('JP',n),null);
});
