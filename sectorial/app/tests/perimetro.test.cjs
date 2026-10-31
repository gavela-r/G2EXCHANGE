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
test('ROE: perímetros distintos → NO_CALCULABLE; iguales o desconocidos → calculado; margen y ROA llevan el perímetro',()=>{
 const mix=period({netIncome:ok(100,'DOMINANTE'),equity:ok(800,'TOTAL')});
 assert.equal(k(mix,'ROE').status,'NO_CALCULABLE');assert.equal(k(mix,'ROE').cause,'PERIMETRO_INCOMPATIBLE:DOMINANTE/TOTAL');
 assert.equal(k(mix,'MARGEN_NETO').status,'CERTIFICADO');assert.equal(k(mix,'MARGEN_NETO').perimeter,'DOMINANTE');assert.equal(k(mix,'ROA').perimeter,'DOMINANTE');
 assert.equal(k(period({netIncome:ok(100,'TOTAL'),equity:ok(800,'TOTAL')}),'ROE').value,12.5);
 assert.equal(k(period({netIncome:ok(100,null),equity:ok(800,'TOTAL')}),'ROE').status,'CERTIFICADO');
});
