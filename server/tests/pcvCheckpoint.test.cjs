const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {guardarEstadoPcv}=require('../scripts/pcv-checkpoint.cjs');
test('PCV checkpoint retries Windows file locks while preserving the previous complete cursor',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'g2-pcv-cp-')),'checkpoint.json');fs.writeFileSync(file,JSON.stringify({after:10}));let failures=0;
 guardarEstadoPcv(file,{after:20},{writeFileSync:fs.writeFileSync,renameSync:(from,to)=>{if(failures++<2){assert.equal(JSON.parse(fs.readFileSync(file)).after,10);throw Object.assign(new Error('Windows lock'),{code:'EPERM'});}fs.renameSync(from,to);}},()=>{});
 assert.equal(failures,3);assert.equal(JSON.parse(fs.readFileSync(file)).after,20);
});
test('PCV checkpoint leaves the last cursor intact after a persistent lock or unrelated IO failure',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'g2-pcv-cp-')),'checkpoint.json');fs.writeFileSync(file,JSON.stringify({after:10}));let attempts=0;
 assert.throws(()=>guardarEstadoPcv(file,{after:20},{writeFileSync:fs.writeFileSync,renameSync:()=>{attempts++;throw Object.assign(new Error('lock'),{code:'EBUSY'});}},()=>{}),/lock/);assert.equal(attempts,8);assert.equal(JSON.parse(fs.readFileSync(file)).after,10);
 assert.throws(()=>guardarEstadoPcv(file,{after:30},{writeFileSync:fs.writeFileSync,renameSync:()=>{throw Object.assign(new Error('disk IO'),{code:'EIO'});}},()=>{throw new Error('must not retry');}),/disk IO/);assert.equal(JSON.parse(fs.readFileSync(file)).after,10);
});
