const {test}=require('node:test'),assert=require('node:assert/strict');
const {numeroInlineMops:num,extraerAnualMops:extract}=require('../dist/src/pcv/mopsAnualVerificado');
const source={stockId:'2330',year:2022,filename:'tifrs-fr1-m1-ci-cr-2330-2022Q4.html',basis:'consolidated',observedAt:'2026-10-29T13:13:39.118Z',officialChineseName:'SYNTHETIC'};
const fact=(tag,value,ctx='annual',extra='')=>`<ix:nonFraction name="ifrs-full:${tag}" contextRef="${ctx}" unitRef="twd" format="ixt:numdotdecimal" ${extra}>${value}</ix:nonFraction>`;
const context=(id,start='2022-01-01',extra='')=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="synthetic">2330</xbrli:identifier>${extra}</xbrli:entity><xbrli:period>${start?`<xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>2022-12-31</xbrli:endDate>`:'<xbrli:instant>2022-12-31</xbrli:instant>'}</xbrli:period></xbrli:context>`;
const doc=(facts,extra='')=>Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2022-03-24/ifrs-full" xmlns:tifrs-notes="http://www.xbrl.org/tifrs/notes/2022-03-31"><ix:nonNumeric name="tifrs-notes:CompanyID">2330</ix:nonNumeric><ix:nonNumeric name="tifrs-notes:CompanyChineseName">SYNTHETIC</ix:nonNumeric>${context('annual')}${context('instant',null)}<xbrli:unit id="twd"><xbrli:measure>iso4217:TWD</xbrli:measure></xbrli:unit>${extra}${facts}</html>`);
const run=(facts,extra='')=>extract(doc(fact('Revenue','100')+facts,extra),source,'SYNTHETIC');
test('MOPS scale is a unit multiplier; decimals is precision, and absence never becomes zero',()=>{
 assert.equal(num('1,234',{format:'ixt:numdotdecimal',scale:'3',decimals:'-3'}),1234000);
 assert.equal(num('1,234',{decimals:'-3'}),1234);assert.equal(num('-',{}),null);assert.equal(num('0',{}),0);
 assert.equal(num('-',{format:'ixt:zerodash',scale:'3'}),0);assert.equal(num('1,23',{}),null);assert.equal(num('1',{'xsi:nil':'true'}),null);
 assert.equal(num('(100)',{sign:'-'}),-100);assert.equal(num('(100)',{}),null);assert.equal(num('100',{scale:'50'}),null);
});
test('MOPS independently isolates conflicting concepts and rejects components as total debt',()=>{
 const r=run(fact('Assets','200','instant')+fact('Assets','201','instant')+fact('ShorttermBorrowings','9','instant')+fact('LongtermBorrowings','8','instant'));
 assert.equal(r.rows.find(x=>x.codigo==='INGRESOS').importe,100);assert.ok(!r.rows.some(x=>['ACTIVOS_TOTALES','DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO'].includes(x.codigo)));
 assert.ok(r.pending.some(x=>x.reason==='MOPS_SAME_CONTEXT_CONTRADICTION'));
});
test('MOPS excludes segmented, wrong-currency and duration balance facts',()=>{
 const r=run(fact('Assets','99')+fact('GrossProfit','55','segment')+fact('ProfitLoss','44','foreign'),context('segment','2022-01-01','<xbrldi:explicitMember>SEGMENT</xbrldi:explicitMember>'));
 assert.deepEqual(r.rows.map(x=>x.codigo),['INGRESOS']);
 const xml=doc(fact('Revenue','100')).toString().replace('iso4217:TWD','iso4217:USD');assert.throws(()=>extract(Buffer.from(xml),source,'SYNTHETIC'),/CLOSING_YEAR/);
});
test('MOPS binds annual year, issuer and verified consolidated filename; observation is not publication',()=>{
 const b=doc(fact('Revenue','100'));for(const s of [{...source,stockId:'9999'},{...source,year:2023},{...source,basis:'standalone'},{...source,officialChineseName:'OTHER'}])assert.throws(()=>extract(b,s,'SYNTHETIC'));
 const r=extract(b,source,'SYNTHETIC');assert.equal(r.context.identity.publicationDate,null);assert.equal(r.context.identity.publicationVerified,false);assert.equal(r.context.identity.observedAt,source.observedAt);
});
test('MOPS D&A requires both explicit same-period components, including explicit zero',()=>{
 assert.ok(!run(fact('AdjustmentsForDepreciationExpense','5')).rows.some(x=>x.codigo==='DEPRECIACION_AMORTIZACION'));
 const r=run(fact('AdjustmentsForDepreciationExpense','5','annual','scale="3"')+fact('AdjustmentsForAmortisationExpense','0'));
 assert.equal(r.rows.find(x=>x.codigo==='DEPRECIACION_AMORTIZACION').importe,5000);
});
