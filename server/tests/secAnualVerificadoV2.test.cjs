const {test}=require('node:test'),assert=require('node:assert/strict'),V1=require('../dist/src/pcv/secAnualVerificado'),V2=require('../dist/src/pcv/secAnualVerificadoV2');
const accession='0000000001-25-000001',filing={accession,form:'10-K',end:'2024-12-31',filed:'2025-03-01'},i={id:1,empresa_id:2,nombre_empresa:'OLD SYNTHETIC CORP',country:'US',end:filing.end,filed:filing.filed,accession,form:filing.form,tickers:[]},fact=(val,start='2024-01-01')=>({units:{USD:[{val,...(start?{start}:{}),end:i.end,accn:accession,form:filing.form,filed:filing.filed}]}}),sub={cik:1,name:'NEW SYNTHETIC CORPORATION',formerNames:[{name:'OLD SYNTHETIC CORPORATION',from:'2010-01-01',to:'2023-01-01'}]},body=()=>({cik:1,entityName:sub.name,facts:{'us-gaap':{Revenues:fact(100),PaymentsToAcquireProductiveAssets:fact(10),LongTermDebtAndCapitalLeaseObligations:fact(20,null)}}});
test('An explicitly dated SEC alias of the same CIK restores an outdated database name without changing V1',()=>{
 assert.throws(()=>V1.extraerAnualSecVerificado(body(),sub,i,'0000000001',filing,{}),/IDENTIDAD/);
 const r=V2.extraerAnualSecVerificado(body(),sub,i,'0000000001',filing,{});assert.equal(r.context.identity.identityCriterion,'OFFICIAL_SAME_CIK_EXPLICIT_NAME_CONTINUITY');assert.equal(r.rows.length,3);
 assert.throws(()=>V2.extraerAnualSecVerificado(body(),{...sub,cik:2},i,'0000000001',filing,{}),/IDENTIDAD/);assert.throws(()=>V2.extraerAnualSecVerificado(body(),{...sub,formerNames:[]},i,'0000000001',filing,{}),/IDENTIDAD/);
});
test('Verified productive-asset CAPEX and noncurrent legacy lease/debt totals retain their exact context',()=>{
 const r=V2.extraerAnualSecVerificado(body(),sub,i,'0000000001',filing,{});assert.equal(r.rows.find(x=>x.codigo==='CAPEX').importe,10);assert.equal(r.rows.find(x=>x.codigo==='DEUDA_LARGO_PLAZO').importe,20);
 const b=body();b.facts['us-gaap'].LongTermDebtAndCapitalLeaseObligations= fact(20);assert.ok(!V2.extraerAnualSecVerificado(b,sub,i,'0000000001',filing,{}).rows.some(x=>x.codigo==='DEUDA_LARGO_PLAZO'));
 b.facts['us-gaap'].PaymentsToAcquireProductiveAssets.units.USD[0].start='2024-04-01';assert.ok(!V2.extraerAnualSecVerificado(b,sub,i,'0000000001',filing,{}).rows.some(x=>x.codigo==='CAPEX'));
});
