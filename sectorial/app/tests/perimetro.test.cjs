// Perímetro de beneficio y patrimonio: la réplica del adaptador coincide con el backend y el ROE no mezcla perímetros.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {perimeter}=require('../adapter.cjs'),{kpisForPeriod}=require('../kpi.cjs');
const backend=require(path.resolve(__dirname,'../../../server/dist/src/pcv/seleccionObservaciones'));
test('réplica del adaptador = perimetroDeEtiqueta del backend',()=>{
 for(const code of ['BENEFICIO_NETO','PATRIMONIO_NETO'])for(const tag of ['us-gaap:NetIncomeLoss','ProfitLoss','jppfs_cor:ProfitLossAttributableToOwnersOfParent','jpigp_cor:ProfitLossIFRS','StockholdersEquity','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','jppfs_cor:NetAssets','jpcrp_cor:NetAssetsSummaryOfBusinessResults','EquityAttributableToOwnersOfParent','IncomeAfterTaxes','Equity','Revenues'])
  assert.equal(perimeter(code,tag),backend.perimetroDeEtiqueta(code,tag),code+' '+tag);
});
const ok=(value,perimeter)=>({value,validation:'VALIDADO',recordIds:[1],...(perimeter!==undefined?{perimeter}:{})});
const period=f=>({fiscalYear:2024,periodEnd:'2024-12-31',fields:{revenue:ok(1000),assets:ok(5000),...f}});
const k=(p,c)=>kpisForPeriod(p).find(x=>x.code===c);
test('ROE: distintos → NO_CALCULABLE; desconocido → BLOQUEADO; sólo iguales → CERTIFICADO; margen y ROA llevan el perímetro',()=>{
 const mix=period({netIncome:ok(100,'DOMINANTE'),equity:ok(800,'TOTAL')});
 assert.equal(k(mix,'ROE').status,'NO_CALCULABLE');assert.equal(k(mix,'ROE').cause,'PERIMETRO_INCOMPATIBLE:DOMINANTE/TOTAL');
 assert.equal(k(mix,'MARGEN_NETO').status,'CERTIFICADO');assert.equal(k(mix,'MARGEN_NETO').perimeter,'DOMINANTE');assert.equal(k(mix,'ROA').perimeter,'DOMINANTE');
 assert.equal(k(period({netIncome:ok(100,'TOTAL'),equity:ok(800,'TOTAL')}),'ROE').value,12.5);
 const unk=k(period({netIncome:ok(100,null),equity:ok(800,'TOTAL')}),'ROE');assert.equal(unk.status,'BLOQUEADO_DEPENDENCIA');assert.equal(unk.value,null);assert.equal(unk.cause,'PERIMETRO_DESCONOCIDO:?/TOTAL');
 assert.equal(k(period({netIncome:ok(100),equity:ok(800)}),'ROE').status,'BLOQUEADO_DEPENDENCIA');
});
test('V2: la parte de minoritarios y el impuesto no son BENEFICIO_NETO; el total con minoritarios sí',()=>{
 const {noEsBeneficioNeto:n,seleccionarObservaciones:s,POLITICA_SELECCION}=backend;assert.equal(POLITICA_SELECCION,'SELECCION_OBSERVACIONES_V2');
 assert.equal(n({concepto_estandar:'BENEFICIO_NETO',concepto:'ComprehensiveIncomeConsolidatedNetIncomeAttributedNonControllingInterest'}),true);
 assert.equal(n({concepto_estandar:'BENEFICIO_NETO',concepto:'us-gaap:NetIncomeLossAttributableToNoncontrollingInterest'}),true);
 assert.equal(n({concepto_estandar:'BENEFICIO_NETO',concepto:'TAX'}),true);
 assert.equal(n({concepto_estandar:'BENEFICIO_NETO',concepto:'ProfitLossIncludingPortionAttributableToNoncontrollingInterest'}),false);
 assert.equal(n({concepto_estandar:'BENEFICIO_NETO',concepto:'jppfs_cor:ProfitLossAttributableToOwnersOfParent'}),false);
 const r=s([{concepto_estandar:'BENEFICIO_NETO',concepto:'IncomeAfterTaxes',importe:100},{concepto_estandar:'BENEFICIO_NETO',concepto:'ComprehensiveIncomeConsolidatedNetIncomeAttributedNonControllingInterest',importe:7},{concepto_estandar:'BENEFICIO_NETO',concepto:'TAX',importe:20}]);
 assert.deepEqual(r.filas.map(f=>f.importe),[100]);assert.equal(r.sinResolver.length,0);
});
