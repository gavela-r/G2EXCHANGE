const {test}=require('node:test'),assert=require('node:assert/strict');
const {seleccionarInformesObjetivo,extraerInformesRecientes}=require('../dist/insercionDatos/insercionInformeFinanciero');
test('A 2026 closing does not displace the protected 2022–2025 US recovery window',()=>{
 const rows=[2021,2022,2023,2024,2025,2026].map(year=>({tipoPeriodo:'ANUAL',fechaFinPeriodo:year+'-03-31',fechaPublicacion:year+'-06-01',identificadorFuente:String(year)}));
 assert.deepEqual(seleccionarInformesObjetivo(rows,true).map(x=>x.fechaFinPeriodo),['2026-03-31','2025-03-31','2024-03-31','2023-03-31','2022-03-31']);
 assert.equal(seleccionarInformesObjetivo(rows).length,4);
});
test('Legacy metadata parsing also recognizes annual foreign forms and amendments',()=>{
 const forms=['10-K','10-K/A','20-F','20-F/A','40-F','40-F/A','10-Q','10-Q/A','S-1'],json={filings:{recent:{form:forms,filingDate:forms.map(()=> '2025-03-01'),reportDate:forms.map(()=> '2024-12-31'),accessionNumber:forms.map((_,n)=>'SYNTHETIC'+n)}}};
 const r=extraerInformesRecientes(1,json);assert.equal(r.length,8);assert.equal(r.filter(x=>x.tipoPeriodo==='ANUAL').length,6);
});
