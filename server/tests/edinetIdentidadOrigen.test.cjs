const {test}=require('node:test'),assert=require('node:assert/strict'),Z=require('adm-zip');
const {reconstruirVinculos,validarNombreLegalDocumento}=require('../scripts/pcv-edinet-identidad-origen.cjs');
const header=['EDINETコード','提出者種別','上場区分','連結の有無','資本金','決算日','提出者名','提出者名(英字)','提出者名ヨミ','所在地','提出者業種','証券コード','提出者法人番号'];
const row=(code,en,sec,jcn)=>[code,'内国法人','上場','有','0','3月31日','試験株式会社',en,'シケン','住所','情報',sec,jcn];
const csv=rows=>'metadata\n'+header.join(',')+'\n'+rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\n');
const a=row('E99991','TEST ONE, INC.','99910','1234567890123'),b=row('E99992','TEST TWO, INC.','99920','1234567890124'),c=row('E99993','TEST THREE, INC.','99930','1234567890125'),source=csv([a,b,c]),companies=[{id:10,nombre_empresa:'TEST ONE',tickers:[]},{id:11,nombre_empresa:'TEST TWO',tickers:[]},{id:12,nombre_empresa:'TEST THREE',tickers:[]}],options={expectedCount:3,expectedOffset:10};
function zip(name,namespace='http://disclosure.edinet-fsa.go.jp/taxonomy/jpcrp/2021-11-01/jpcrp_cor'){
 const z=new Z();z.addFile('XBRL/PublicDoc/test.xbrl',Buffer.from(`<xbrli:xbrl xmlns:jpcrp_cor="${namespace}"><jpcrp_cor:CompanyNameInEnglishCoverPage>${name}</jpcrp_cor:CompanyNameInEnglishCoverPage></xbrli:xbrl>`));return z.toBuffer();
}
test('Exact legacy rows and unchanged corporate number recover clipped names after rename or delisting',()=>{
 const current=[a.slice(),b.slice(),c.slice()];current[1][7]='NEW TWO CORPORATION';current[2][11]='';const r=reconstruirVinculos(companies,source,csv(current),options);
 assert.equal(r.bindings.size,3);const binding=r.bindings.get('E99992');assert.equal(validarNombreLegalDocumento(zip('NEW TWO CORPORATION'),binding).jcn,'1234567890124');assert.equal(validarNombreLegalDocumento(zip('TEST TWO, INC.'),binding).securityCode,'99920');
 assert.throws(()=>validarNombreLegalDocumento(zip('TEST TWO OTHER COMPANY'),binding),/NOMBRE_COMPLETO/);assert.throws(()=>validarNombreLegalDocumento(zip('NEW TWO CORPORATION','https://issuer.example/jpcrp_cor'),binding),/NOMBRE_COMPLETO/);
});
test('Source collisions, changed corporate/security numbers and instrument conflicts remain pending',()=>{
 const current=[a.slice(),b.slice(),c.slice()];current[0][12]='1234567890999';current[1][11]='11110';const cs=companies.map(x=>({...x}));cs[2].tickers=['1111'];const r=reconstruirVinculos(cs,source,csv(current),options);assert.equal(r.bindings.size,0);assert.deepEqual(r.pending.map(x=>x.reason),['EDINET_CORPORATE_NUMBER_UNVERIFIED','EDINET_SECURITY_CODE_CONFLICT','DATABASE_INSTRUMENT_CONFLICT']);
 const collision=csv([a,row('E99994','TEST ONE, OTHER.','99940','1234567890126')]);const held=reconstruirVinculos([companies[0]],collision,collision,{expectedCount:1,expectedOffset:10});assert.equal(held.bindings.size,0);assert.equal(held.pending[0].reason,'LEGACY_SOURCE_NAME_COLLISION');
});
test('A different dataset or insertion sequence cannot be accepted as original provenance',()=>{
 assert.throws(()=>reconstruirVinculos(companies.slice(1),source,source,options),/UNIVERSO/);const cs=companies.map(x=>({...x}));cs[1].id=100;assert.throws(()=>reconstruirVinculos(cs,source,source,options),/SECUENCIA/);
});
