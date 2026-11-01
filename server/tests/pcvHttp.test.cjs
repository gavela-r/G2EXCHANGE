const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PcvHttp,CuotaAgotada,POLICY}=require('../scripts/pcv-http.cjs');
test('provider HTTP enforces the persisted free quota before issuing a request',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-pcv-quota-'));fs.writeFileSync(path.join(dir,'EDINET_DB-quota.json'),JSON.stringify({day:new Date().toISOString().slice(0,10),used:96}));
 const client=new PcvHttp(dir);await assert.rejects(()=>client.get('EDINET_DB','https://edinetdb.jp/v1/companies/E99999/financials'),CuotaAgotada);
 await assert.rejects(()=>client.get('SEC_EDGAR','https://unapproved.example/data'),/HOST_PROVEEDOR/);
});
test('provider HTTP caches safely without API keys and shares its quota between instances',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-pcv-http-')),old=global.fetch;let calls=0;
 global.fetch=async(url,options)=>{assert.equal(options.redirect,'error');calls++;return new Response(JSON.stringify({symbol:'SYNTH',annualReports:[]}),{status:200,headers:{'content-type':'application/json'}});};
 try{const u='https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=SYNTH&apikey=SYNTHETIC_TEST_SECRET';await new PcvHttp(dir).get('ALPHAVANTAGE',u);const second=await new PcvHttp(dir).get('ALPHAVANTAGE',u);assert.equal(second.cached,true);assert.equal(calls,1);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'ALPHAVANTAGE-quota.json'))).used,1);for(const f of fs.readdirSync(dir))assert.ok(!fs.readFileSync(path.join(dir,f),'utf8').includes('SYNTHETIC_TEST_SECRET'));}finally{global.fetch=old;}
});
test('provider HTTP preserves account throttling and retries transient failures within the cap',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-pcv-retry-')),old=global.fetch,interval=POLICY.SEC_EDGAR.interval;let calls=0;POLICY.SEC_EDGAR.interval=0;
 try{global.fetch=async()=>{calls++;if(calls<3)throw Error('network');return new Response('{"ok":true}',{status:200});};assert.equal((await new PcvHttp(dir).get('SEC_EDGAR','https://data.sec.gov/test')).data.ok,true);assert.equal(calls,3);
 global.fetch=async()=>new Response('{}',{status:429,headers:{'retry-after':'60'}});await assert.rejects(()=>new PcvHttp(dir).get('SEC_EDGAR','https://data.sec.gov/throttled'),CuotaAgotada);await assert.rejects(()=>new PcvHttp(dir).get('SEC_EDGAR','https://data.sec.gov/next'),CuotaAgotada);
 }finally{global.fetch=old;POLICY.SEC_EDGAR.interval=interval;}
});
test('daily quota resumes without resetting the same-month remaining budget',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-pcv-reset-')),old=global.fetch,today=new Date().toISOString().slice(0,10),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10),file=path.join(dir,'EDINET_DB-quota.json');let calls=0;
 global.fetch=async()=>{calls++;return new Response('{"data":[]}',{headers:{'x-ratelimit-remaining':'99','x-ratelimit-monthly-remaining':'79'}});};
 try{fs.writeFileSync(file,JSON.stringify({day:yesterday,month:today.slice(0,7),used:96,remaining:0,monthlyRemaining:80}));await new PcvHttp(dir).get('EDINET_DB','https://edinetdb.jp/v1/reset');const q=JSON.parse(fs.readFileSync(file));assert.equal(q.used,1);assert.equal(q.monthlyRemaining,79);assert.equal(calls,1);
 fs.writeFileSync(file,JSON.stringify({...q,day:yesterday,monthlyRemaining:0}));await assert.rejects(()=>new PcvHttp(dir).get('EDINET_DB','https://edinetdb.jp/v1/exhausted'),CuotaAgotada);assert.equal(calls,1);
 }finally{global.fetch=old;}
});
test('provider quota reservation retries a transient Windows rename lock before sending the request',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2-pcv-quota-lock-')),oldFetch=global.fetch,oldRename=fs.renameSync;let failures=0,calls=0;
 fs.renameSync=(from,to)=>{if(String(to).endsWith('SEC_EDGAR-quota.json')&&failures++<2)throw Object.assign(new Error('reader lock'),{code:'EPERM'});return oldRename(from,to);};global.fetch=async()=>{calls++;return new Response('{"ok":true}');};
 try{await new PcvHttp(dir).get('SEC_EDGAR','https://data.sec.gov/atomic-test');assert.equal(calls,1);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'SEC_EDGAR-quota.json'))).used,1);assert.ok(failures>=3);}finally{fs.renameSync=oldRename;global.fetch=oldFetch;}
});
