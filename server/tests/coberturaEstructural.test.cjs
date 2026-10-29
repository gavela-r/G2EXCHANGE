const {test}=require('node:test'),assert=require('node:assert/strict');
const {diagnosticarPartidas,diagnosticarKpi}=require('../scripts/pcv-cobertura-modelo.cjs');
const row=(code,value,tag=code)=>({concepto_estandar:code,concepto:tag,importe:value});
test('A conflicting revenue does not hide independent ROA; stored presence is not reproducibility',()=>{
 const rs=[row('INGRESOS',100),row('INGRESOS',200),row('ACTIVOS_TOTALES',1000),row('BENEFICIO_NETO',50)];
 const d=diagnosticarKpi(1,rs,'SEC_EDGAR',[{kpi:'MARGEN_NETO',valor:50},{kpi:'ROA',valor:5}],['MARGEN_NETO','ROA','ROE']);
 assert.deepEqual(d.normalization.conflicts,['INGRESOS']);assert.equal(d.normalization.valores.INGRESOS,undefined);
 assert.equal(d.states.ROA,'REPRODUCIBLE');assert.equal(d.states.MARGEN_NETO,'STORED_NOT_REPRODUCIBLE');assert.equal(d.states.ROE,'MISSING_INPUT_OR_ZERO_DENOMINATOR');
});
test('NULL and movement tags are excluded, real zero remains, duplicates do not create slots',()=>{
 const d=diagnosticarPartidas([row('ACTIVOS_TOTALES',null),row('INVENTARIOS',7,'IncreaseDecreaseInInventories'),row('INGRESOS',0),row('INGRESOS',0)],'SEC_EDGAR');
 assert.equal(d.valores.INGRESOS,0);assert.equal(d.valores.ACTIVOS_TOTALES,undefined);assert.equal(d.valores.INVENTARIOS,undefined);assert.equal(d.accepted.length,1);
});
test('Missing calculation and disagreement are distinguished without changing formulas',()=>{
 const d=diagnosticarKpi(1,[row('BENEFICIO_NETO',10),row('ACTIVOS_TOTALES',100),row('PATRIMONIO_NETO',50)],'SEC_EDGAR',[{kpi:'ROA',valor:2}],['ROA','ROE']);
 assert.equal(d.states.ROA,'STORED_DISAGREES');assert.equal(d.states.ROE,'CALCULABLE_MISSING');assert.equal(d.calculated.find(x=>x.kpi==='ROE').valor,20);
});
test('A partial debt sum is an insufficient input state, not an unexecuted valid calculation',()=>{const rs=[row('DEUDA_LARGO_PLAZO',40)];const d=diagnosticarKpi(1,rs,'SEC_EDGAR',[{kpi:'DEUDA_TOTAL',valor:40}],['DEUDA_TOTAL','DEUDA_NETA']);assert.equal(d.states.DEUDA_TOTAL,'STORED_WITH_INCOMPLETE_DEBT_COMPONENTS');assert.equal(d.states.DEUDA_NETA,'MISSING_DEBT_COMPONENTS');assert.ok(!d.calculated.some(k=>k.kpi==='DEUDA_TOTAL'));});
