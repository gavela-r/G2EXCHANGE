// FinMind TaiwanStockFinancialStatements es trimestre aislado: el anual es la suma de T1-T4.
// Cifras SINTÉTICAS. La validación real (Hon Hai 2317, 2024: T4 = 2,1305 billones; suma T1-T4 = 6.859.615.493.000,
// igual al anual de un tercero) está registrada en docs/historico/INFORME_INTEGRACION_PCV_KPI.md, no en esta prueba.
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../dist/src/pcv/finmindTrimestral.js');
const D='TaiwanStockFinancialStatements';
const hechos=(type,vals,dates=['2024-03-31','2024-06-30','2024-09-30','2024-12-31'])=>{const m=new Map();dates.forEach((d,i)=>{if(vals[i]!==undefined)m.set(d,[...(m.get(d)??[]),{dataset:D,date:d,type,value:vals[i]}]);});return m;};

test('cierres trimestrales del ejercicio (incluye años bisiestos y ejercicios no naturales)',()=>{
 assert.deepEqual(T.cierresTrimestrales('2024-12-31'),['2024-03-31','2024-06-30','2024-09-30','2024-12-31']);
 assert.deepEqual(T.cierresTrimestrales('2025-03-31'),['2024-06-30','2024-09-30','2024-12-31','2025-03-31']);
 assert.deepEqual(T.cierresTrimestrales('2024-06-30'),['2023-09-30','2023-12-31','2024-03-31','2024-06-30']);
 assert.throws(()=>T.cierresTrimestrales('2024-12-30'));
});

test('anual = T1+T2+T3+T4, no la fila del T4',()=>{
 const por=hechos('Revenue',[1000,2000,3000,4000]);
 const t4=por.get('2024-12-31')[0];
 assert.equal(t4.value,4000);assert.equal(T.anualDesdeTrimestres('INGRESOS',t4,por,'2024-12-31'),10000);
});

test('falta un trimestre o hay valores contradictorios → omitido (null, nunca 0)',()=>{
 const falta=hechos('Revenue',[1,2,undefined,4]);assert.equal(T.anualDesdeTrimestres('INGRESOS',falta.get('2024-12-31')[0],falta,'2024-12-31'),null);
 const dup=hechos('Revenue',[1,2,3,4]);dup.get('2024-06-30').push({dataset:D,date:'2024-06-30',type:'Revenue',value:9});
 assert.equal(T.anualDesdeTrimestres('INGRESOS',dup.get('2024-12-31')[0],dup,'2024-12-31'),null);
});

test('EPS no aditivo: no se deriva; los datasets acumulados (flujos) se usan tal cual',()=>{
 const por=hechos('EPS',[1,1,1,3.34]);assert.equal(T.anualDesdeTrimestres('EPS_DILUIDO',por.get('2024-12-31')[0],por,'2024-12-31'),null);
 const cf={dataset:'TaiwanStockCashFlowsStatement',date:'2024-12-31',type:'CashFlowsFromOperatingActivities',value:166028800000};
 assert.equal(T.anualDesdeTrimestres('FLUJO_CAJA_OPERATIVO',cf,new Map(),'2024-12-31'),166028800000);
});

test('la extracción de Taiwán usa la suma trimestral',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../insercionDatos/insercionPartidaContable.ts'),'utf8');
 assert.match(src,/anualDesdeTrimestres\(def\.codigo, encontrado\.fact, porFecha, informe\.fecha_fin_periodo\)/);
});
