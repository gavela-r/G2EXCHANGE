const {test}=require('node:test'),assert=require('node:assert/strict');
const N=require('../dist/src/pcv/normalizarProveedores');
const us={id:1,empresa_id:2,nombre_empresa:'SYNTHETIC CORP',country:'US',end:'2024-12-31',filed:'2025-02-01',accession:'0000999999-25-000001',form:'10-K',tickers:['SYNTH']};
const fact=(val,unit='USD',start='2024-01-01',end=us.end,accn=us.accession)=>({val,start,end,accn,form:'10-K',filed:us.filed});
test('SEC uses verified registrant, exact accession, units and fiscal duration; accession agent is irrelevant',()=>{
 const body={cik:42,entityName:us.nombre_empresa,facts:{'us-gaap':{Revenues:{units:{USD:[fact(120)],EUR:[fact(999)]}},Assets:{units:{USD:[{...fact(500),start:undefined}]}},NetIncomeLoss:{units:{USD:[fact(77,'USD','2024-10-01'),fact(90,'USD','2023-01-01','2023-12-31')]}}}}};
 const r=N.normalizarSec(body,us,'42');assert.equal(r.find(x=>x.codigo==='INGRESOS').importe,120);assert.equal(r.find(x=>x.codigo==='ACTIVOS_TOTALES').importe,500);assert.ok(!r.some(x=>x.codigo==='BENEFICIO_NETO'));assert.throws(()=>N.normalizarSec({...body,cik:999},us,'42'),/IDENTIDAD/);
});
test('reported NULL and strings remain absent while a reported zero is preserved',()=>{for(const v of [null,undefined,'','None','NULL','--',true,NaN,Infinity])assert.equal(N.numeroReportado(v),null);assert.equal(N.numeroReportado('0'),0);});
test('SEC historical names are accepted only for the same CIK and filing-date interval',()=>{
 const s={cik:42,formerNames:[{name:us.nombre_empresa,from:'2020-01-01T00:00:00Z',to:'2026-01-01T00:00:00Z'}]};assert.equal(N.identidadHistoricaSec(us,'42',s),true);assert.equal(N.identidadHistoricaSec(us,'43',s),false);assert.equal(N.identidadHistoricaSec({...us,filed:'2027-01-01'},'42',s),false);
});
test('EDINET UTF-16 TSV is parsed using its delimiter rather than silently producing one column',()=>{
 const {jpPcvLeerCsvsZip}=require('../dist/insercionDatos/insercionPartidaContable'),Z=require('adm-zip'),z=new Z();
 z.addFile('XBRL_TO_CSV/test.csv',Buffer.concat([Buffer.from([255,254]),Buffer.from('element\tcontext\tvalue\nRevenue\tCurrentYearDuration\t123\n','utf16le')]));const r=jpPcvLeerCsvsZip(z.toBuffer());assert.equal(r[0].value,'123');assert.equal(r[0].element,'Revenue');
});
test('FinDataEngine rejects another filing or issuer rather than importing restated annual data',()=>{
 const profile={data:{cik:42,name:us.nombre_empresa}},body={meta:{cik:42,period:'annual',statement:'income_statement'},data:[{period_end:us.end,accession:us.accession,revenue:100,net_income:null,interest_expense:0}]};
 const r=N.normalizarFde(body,profile,us,'42','income_statement');assert.equal(r.length,2);assert.equal(r.find(x=>x.codigo==='GASTO_INTERESES').importe,0);
 assert.equal(N.normalizarFde({...body,data:[{...body.data[0],accession:'different'}]},profile,us,'42','income_statement').length,0);
 assert.throws(()=>N.normalizarFde(body,{data:{cik:7,name:us.nombre_empresa}},us,'42','income_statement'),/IDENTIDAD/);
});
test('Alpha annual statements require exact symbol, closing date and currency',()=>{const b={symbol:'SYNTH',annualReports:[{fiscalDateEnding:us.end,reportedCurrency:'USD',totalRevenue:'123',netIncome:'None'}]};assert.equal(N.normalizarAlpha(b,us,'INCOME_STATEMENT').length,1);assert.equal(N.normalizarAlpha({...b,annualReports:[{...b.annualReports[0],reportedCurrency:'EUR'}]},us,'INCOME_STATEMENT').length,0);assert.throws(()=>N.normalizarAlpha({...b,symbol:'OTHER'},us,'INCOME_STATEMENT'),/IDENTIDAD/);});
test('EDINET DB requires original docID and independently verified consolidated basis',()=>{
 const jp={...us,country:'JP',accession:'SYNTHDOC'},identity={edinetCode:'E99999',consolidated:true,end:us.end,securityCode:'99990'},body={meta:{edinet_code:'E99999',period:'annual'},data:[{fiscal_year:2024,doc_id:'SYNTHDOC',basis:'consolidated',basis_source:'value_provenance',revenue:300,net_income:null}]};
 assert.equal(N.normalizarEdinetDb(body,identity,jp).length,1);assert.equal(N.normalizarEdinetDb({...body,data:[{...body.data[0],basis:'standalone'}]},identity,jp).length,0);assert.equal(N.normalizarEdinetDb({...body,data:[{...body.data[0],doc_id:'OTHER'}]},identity,jp).length,0);
});
test('EDINET XBRL excludes prior years, segments, standalone and wrong units',()=>{
 const Z=require('adm-zip'),z=new Z();const ctx=(id,end,member='')=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier>E99999-000</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period>${member?`<xbrli:scenario><xbrldi:explicitMember>${member}</xbrldi:explicitMember></xbrli:scenario>`:''}</xbrli:context>`;
 const xml=`<xbrli:xbrl><dei:EDINETCodeDEI>E99999</dei:EDINETCodeDEI><dei:SecurityCodeDEI>99990</dei:SecurityCodeDEI><dei:CurrentFiscalYearEndDateDEI>2024-12-31</dei:CurrentFiscalYearEndDateDEI><dei:WhetherConsolidatedFinancialStatementsArePreparedDEI>true</dei:WhetherConsolidatedFinancialStatementsArePreparedDEI><xbrli:unit id="JPY"><xbrli:measure>iso4217:JPY</xbrli:measure></xbrli:unit>${ctx('current',us.end)}${ctx('prior','2023-12-31')}${ctx('standalone',us.end,'NonConsolidatedMember')}${ctx('segment',us.end,'SomeSegmentMember')}<jppfs:NetSales contextRef="current" unitRef="JPY">123</jppfs:NetSales><jppfs:NetSales contextRef="prior" unitRef="JPY">999</jppfs:NetSales><jppfs:NetSales contextRef="standalone" unitRef="JPY">888</jppfs:NetSales><jppfs:NetSales contextRef="segment" unitRef="JPY">777</jppfs:NetSales></xbrli:xbrl>`;
 z.addFile('XBRL/PublicDoc/test.xbrl',Buffer.from(xml));const jp={...us,country:'JP',tickers:['9999']},r=N.normalizarEdinetZip(z.toBuffer(),jp);assert.equal(r.rows.length,1);assert.equal(r.rows[0].importe,123);assert.throws(()=>N.normalizarEdinetZip(z.toBuffer(),{...jp,tickers:['1234']}),/IDENTIDAD/);
});
test('supplementary cash-flow signs use explicit field mappings; no general ABS transformation',()=>{
 const {normalizarPartidas}=require('../dist/src/valoracion/datos');const r={concepto_estandar:'CAPEX',importe:-12,signo_esperado:'POSITIVO',alias_edinet:'PurchaseOfPropertyPlantAndEquipmentInvCF'};
 assert.equal(normalizarPartidas([{...r,concepto:'EDINET_DB:purchase_of_ppe'}],'EDINET').valores.CAPEX,12);
 assert.equal(normalizarPartidas([{...r,concepto:'EDINET_DB:unknown'}],'EDINET').valores.CAPEX,undefined);
});
