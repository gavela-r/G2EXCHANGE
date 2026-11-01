const {test}=require('node:test'),assert=require('node:assert/strict'),Z=require('adm-zip');
const {extraerAnualEdinetVerificado:extract}=require('../dist/src/pcv/edinetAnualVerificado');
const i={id:1,empresa_id:2,nombre_empresa:'SYNTHETIC',country:'JP',end:'2022-03-31',filed:'2022-06-29',accession:'S9999999',form:'Annual Securities Report',tickers:['9999']},context=(id,start=null,end=i.end,member='')=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier>E99999-000</xbrli:identifier></xbrli:entity><xbrli:period>${start?`<xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate>`:`<xbrli:instant>${end}</xbrli:instant>`}</xbrli:period>${member?`<xbrli:scenario><xbrldi:explicitMember dimension="jppfs_cor:ConsolidatedOrNonConsolidatedAxis">jppfs_cor:${member}</xbrldi:explicitMember></xbrli:scenario>`:''}</xbrli:context>`,fact=(tag,value,ctx,unit='JPY')=>`<${tag} contextRef="${ctx}" unitRef="${unit}">${value}</${tag}>`;
function zip(facts,docEnd=i.end,docStart='2021-04-01'){
 const z=new Z(),ns=['jpdei','jppfs','jpcrp','jpigp'].map(p=>`xmlns:${p}_cor="http://disclosure.edinet-fsa.go.jp/taxonomy/${p}/2021-11-01/${p}_cor"`).join(' ');
 z.addFile('XBRL/PublicDoc/synthetic.xbrl',Buffer.from(`<xbrli:xbrl ${ns}><jpdei_cor:EDINETCodeDEI>E99999</jpdei_cor:EDINETCodeDEI><jpdei_cor:SecurityCodeDEI>99990</jpdei_cor:SecurityCodeDEI><jpdei_cor:CurrentFiscalYearStartDateDEI>${docStart}</jpdei_cor:CurrentFiscalYearStartDateDEI><jpdei_cor:CurrentFiscalYearEndDateDEI>${docEnd}</jpdei_cor:CurrentFiscalYearEndDateDEI><jpdei_cor:WhetherConsolidatedFinancialStatementsArePreparedDEI>1</jpdei_cor:WhetherConsolidatedFinancialStatementsArePreparedDEI><xbrli:unit id="JPY"><xbrli:measure>iso4217:JPY</xbrli:measure></xbrli:unit><xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>${context('instant')}${context('duration','2021-04-01')}${context('standalone',null,i.end,'NonConsolidatedMember')}${context('segment',null,i.end,'SomeSegmentMember')}${facts}</xbrli:xbrl>`));return z.toBuffer();
}
test('EDINET verifies issuer, DEI start/end, numeric boolean consolidation and exact annual contexts',()=>{
 const r=extract(zip(fact('jppfs_cor:NetSales',100,'duration')+fact('jpigp_cor:AssetsIFRS',1000,'instant')+fact('jppfs_cor:CashAndCashEquivalents',99,'standalone')+fact('jppfs_cor:Inventories',10,'segment')),i,'E99999');
 assert.equal(r.rows.length,2);assert.equal(r.context.basis,'consolidated');assert.equal(r.start,'2021-04-01');assert.throws(()=>extract(zip(''),i,'E11111'),/IDENTIDAD/);
});
test('A discrepant concept does not block other facts; issued shares and subtotal/custom labels are withheld',()=>{
 const r=extract(zip(fact('jppfs_cor:NetSales',100,'duration')+fact('jppfs_cor:NetSales',200,'duration')+fact('jppfs_cor:Assets',1000,'instant')+fact('jpcrp_cor:TotalNumberOfIssuedSharesSummaryOfBusinessResults',123,'instant','shares')+fact('issuer:CashAndCashEquivalents',10,'instant')+fact('jppfs_cor:RawMaterials',30,'instant')),i,'E99999');
 assert.deepEqual(r.rows.map(x=>x.codigo),['ACTIVOS_TOTALES']);assert.ok(r.pending.some(x=>x.reason.includes('CONTRADICTORIOS')));assert.ok(r.pending.some(x=>x.reason==='ISSUED_SHARES_NOT_ASSUMED_OUTSTANDING'));
});
test('Older consolidated comparatives require an explicit later-document binding and retain real zero',()=>{
 const bytes=zip(fact('jppfs_cor:NetSales',0,'duration')+fact('jppfs_cor:Assets',1000,'instant'),'2023-03-31','2022-04-01');assert.throws(()=>extract(bytes,i,'E99999'),/IDENTIDAD_PERIODO/);
 const r=extract(bytes,i,'E99999',{documentEnd:'2023-03-31'});assert.equal(r.rows.length,2);assert.equal(r.rows[0].importe,0);assert.ok(r.rows.every(x=>x.evidence.comparative));
});
