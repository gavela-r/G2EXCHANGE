const {test}=require('node:test'),assert=require('node:assert/strict');
const {presentacionesAnualesSec,extraerAnualSecVerificado:extract,cierresComparativosSec}=require('../dist/src/pcv/secAnualVerificado');
const cik='0000000001',a='0000000001-25-000001',filing={accession:a,form:'20-F',end:'2024-12-31',filed:'2025-03-01',indexHash:'SYNTHETIC'},i={id:1,empresa_id:2,nombre_empresa:'SYNTHETIC CORP',country:'US',end:'2024-12-31',filed:filing.filed,accession:a,form:'20-F',tickers:[]};
const f=(val,end=i.end,start='2024-01-01',unit='USD')=>({units:{[unit]:[{val,end,...(start?{start}:{}),accn:a,form:'20-F',filed:filing.filed}]}}),body=()=>({cik:1,entityName:'SYNTHETIC CORPORATION',facts:{'us-gaap':{Revenues:f(100),Assets:f(1000,i.end,null),NetIncomeLoss:f(10),GrossProfit:f(30)}}}),sub={cik:1,name:'SYNTHETIC CORPORATION'};
test('Annual discovery covers historical 10-K/A, 20-F and 40-F, excluding interim/nonfinancial forms',()=>{
 const forms=['10-K/A','20-F','40-F','10-Q','S-1'],index={accessionNumber:forms.map((_,n)=>'0000000001-25-'+String(n+1).padStart(6,'0')),form:forms,reportDate:forms.map(()=>i.end),filingDate:forms.map(()=>filing.filed)};
 assert.deepEqual(presentacionesAnualesSec([{data:index,hash:'SYNTHETIC'}]).map(x=>x.form).sort(),['10-K/A','20-F','40-F']);
});
test('Exact legal identity, annual period, unit and instant facts remain mandatory without a ticker',()=>{
 const b=body(),r=extract(b,sub,i,cik,filing,{});assert.equal(r.rows.length,4);assert.equal(r.start,'2024-01-01');
 b.facts['us-gaap'].Assets=f(999,i.end,'2024-01-01');assert.ok(!extract(b,sub,i,cik,filing,{}).rows.some(x=>x.codigo==='ACTIVOS_TOTALES'));
 assert.throws(()=>extract(body(),{...sub,cik:9},i,cik,filing,{}),/IDENTIDAD/);
});
test('One contradictory fact excludes its concept while independent fields survive',()=>{
 const b=body();b.facts['us-gaap'].Revenues.units.USD.push({...b.facts['us-gaap'].Revenues.units.USD[0],val:200});
 const r=extract(b,sub,i,cik,filing,{});assert.ok(!r.rows.some(x=>x.codigo==='INGRESOS'));assert.ok(r.rows.some(x=>x.codigo==='ACTIVOS_TOTALES'));assert.ok(r.pending.some(x=>x.reason.includes('CONTRADICTORIOS')));
});
test('A comparative period remains explicitly bound to its later annual accession, never to FY labels',()=>{
 const b=body();for(const v of Object.values(b.facts['us-gaap']))for(const x of v.units.USD){x.end='2022-12-31';if(x.start)x.start='2022-01-01';x.fy=2024;}
 const ci={...i,end:'2022-12-31',accession:a+'@2022-12-31'},r=extract(b,sub,ci,cik,filing,{});assert.equal(r.rows.length,4);assert.ok(r.rows.every(x=>x.identifier===ci.accession&&x.evidence.accession===a&&x.evidence.comparative));assert.deepEqual(cierresComparativosSec(b,filing),['2022-12-31']);
});
test('Subtotal labels and foreign currency do not become aggregate USD financial data',()=>{
 const b=body();delete b.facts['us-gaap'].Revenues;b.facts['us-gaap'].SalesRevenueGoodsNet=f(99);assert.ok(!extract(b,sub,i,cik,filing,{}).rows.some(x=>x.codigo==='INGRESOS'));
 const foreign=body();for(const v of Object.values(foreign.facts['us-gaap'])){v.units.CNY=v.units.USD;delete v.units.USD;}assert.throws(()=>extract(foreign,sub,i,cik,filing,{}),/MONEDA_NO_SOPORTADA_CNY/);
});
