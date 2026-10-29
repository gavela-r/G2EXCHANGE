const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Zip=require('adm-zip');
const {entradaPermitida,extraer}=require('../scripts/pcv-sec-bulk.cjs');
const {fuentesSecMaterializadas}=require('../scripts/pcv-sec-materializacion.cjs');
test('Bulk extraction permits only fixed-universe CIK JSON names, including SEC history shards',async()=>{
 const ciks=new Set(['0000000001']);for(const n of ['../CIK0000000001.json','x/CIK0000000001.json','C:\\CIK0000000001.json','CIK0000000002.json','CIK0000000001.xml'])assert.equal(entradaPermitida('submissions',n,ciks),false);
 assert.equal(entradaPermitida('submissions','CIK0000000001-submissions-001.json',ciks),true);assert.equal(entradaPermitida('companyfacts','CIK0000000001-submissions-001.json',ciks),false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-sec-bulk-')),z=new Zip();z.addFile('CIK0000000001.json',Buffer.from('{"cik":1}'));z.addFile('CIK0000000002.json',Buffer.from('{"cik":2}'));z.writeZip(path.join(dir,'companyfacts.zip'));
 assert.equal(await extraer('companyfacts',dir,ciks),1);assert.deepEqual(fs.readdirSync(path.join(dir,'companyfacts')),['CIK0000000001.json']);assert.equal(await extraer('companyfacts',dir,ciks),1);
});
test('Archive completion does not bypass rehydration after restoring a portable bundle',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-sec-materialize-')),state={done:true,archives:{companyfacts:{entries:1},submissions:{entries:1}}};assert.equal(fuentesSecMaterializadas(dir,state),false);for(const k of ['companyfacts','submissions']){fs.mkdirSync(path.join(dir,k));fs.writeFileSync(path.join(dir,k,'CIK0000000001.json'),'{}');}assert.equal(fuentesSecMaterializadas(dir,state),true);fs.writeFileSync(path.join(dir,'submissions','CIK0000000001-submissions-001.json.tmp'),'{}');state.archives.submissions.entries=2;assert.equal(fuentesSecMaterializadas(dir,state),false);});
