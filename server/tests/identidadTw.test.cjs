const {test}=require('node:test'),assert=require('node:assert/strict'),{vincularTaiwan:bind}=require('../scripts/pcv-identidad-tw.cjs');
const master=[{'公司代號':'0050','公司名稱':'SYNTHETIC LEGAL','公司簡稱':'SYNTHETIC','英文簡稱':'TEST','營利事業統一編號':'12345678'}];
test('TW exact stock code retains leading zeros and requires an independent exact name',()=>{
 assert.equal(bind({nombre_empresa:'TEST'},[{ticker:'0050.TW'}],master).verified,true);
 assert.equal(bind({nombre_empresa:'TEST'},[{ticker:'50.TW'}],master).verified,false);
 assert.equal(bind({nombre_empresa:'TEST OTHER'},[{ticker:'0050.TW'}],master).verified,false);
 assert.equal(bind({nombre_empresa:'TEST'},[],master).verified,false);
 assert.equal(bind({nombre_empresa:'TEST'},[{ticker:'0050.TW'},{ticker:'0051.TW'}],master).verified,false);
 assert.equal(bind({nombre_empresa:'TEST'},[{ticker:'0050.TW'}],[...master,...master]).verified,false);
});
