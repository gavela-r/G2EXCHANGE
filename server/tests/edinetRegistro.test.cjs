const {test}=require('node:test'),assert=require('node:assert/strict');const {leerRegistroEdinetCsv,vincularRegistroEdinet,validarDocumentoAnualEdinet}=require('../dist/src/pcv/edinetRegistro');
const csv='更新日,2026-10-28\nＥＤＩＮＥＴコード,提出者種別,上場区分,連結の有無,資本金,決算日,提出者名,提出者名（英字）,提出者名（ヨミ）,所在地,提出者業種,証券コード,提出者法人番号\nE99999,会社,上場,有,1,03-31,試験会社,"SYNTHETIC CO., LTD.",テスト,東京,機械,99990,1234567890123\n';
test('official EDINET CSV preserves quoted commas without shifting securities code or sector',()=>{const [r]=leerRegistroEdinetCsv(csv);assert.equal(r.englishName,'SYNTHETIC CO., LTD.');assert.equal(r.securityCode,'99990');assert.equal(r.sector,'機械');});
test('EDINET identity requires unique legal name and consistent securities code; legacy CSV repair needs both',()=>{
 const r=leerRegistroEdinetCsv(csv);assert.equal(vincularRegistroEdinet([{id:1,nombre_empresa:'SYNTHETIC CO., LTD.',tickers:[]}],r).size,1);
 assert.equal(vincularRegistroEdinet([{id:1,nombre_empresa:'SYNTHETIC CO.',tickers:['9999']}],r).size,1);
 assert.equal(vincularRegistroEdinet([{id:1,nombre_empresa:'SYNTHETIC CO.',tickers:[]}],r).size,0);
 assert.equal(vincularRegistroEdinet([{id:1,nombre_empresa:'SYNTHETIC CO., LTD.',tickers:['1234']}],r).size,0);
 assert.equal(vincularRegistroEdinet([{id:1,nombre_empresa:'SYNTHETIC CO., LTD.',tickers:[]},{id:2,nombre_empresa:'SYNTHETIC CO., LTD.',tickers:[]}],r).size,0);
});
test('EDINET discovery rejects withdrawn, quarterly and out-of-scope documents',()=>{const d={docID:'S9999999',docTypeCode:'120',xbrlFlag:'1',withdrawalStatus:'0',disclosureStatus:'0',periodStart:'2021-04-01',periodEnd:'2022-03-31',submitDateTime:'2022-06-29 10:00'};assert.equal(validarDocumentoAnualEdinet(d),true);for(const patch of [{withdrawalStatus:'1'},{xbrlFlag:'0'},{periodEnd:'2021-03-31'},{periodStart:'2022-01-01'},{periodEnd:'2022-02-30'},{docTypeCode:'130'}])assert.equal(validarDocumentoAnualEdinet({...d,...patch}),false);});
