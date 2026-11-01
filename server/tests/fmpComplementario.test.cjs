const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {cuentasFmp,clasificarFmp,evaluarHistorico,puedeConmutarFmp,habilitarComplemento,comprobarFmp,comprobarRegionesFmp}=require('../scripts/pcv-fmp-complementario.cjs');
const statements=[2022,2023,2024,2025].map(year=>({symbol:'AAPL',date:year+'-09-30',period:'FY',reportedCurrency:'USD',fiscalYear:String(year)}));
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'g2-fmp-capabilities-')),clean=dir=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});};
test('FMP accounts remain separate aliases; quota, authentication and transient errors differ',()=>{
 const c=cuentasFmp({FMP_API_KEY:'SYNTHETIC_PRIVATE_ONE',FMP_API_KEY_2:'SYNTHETIC_PRIVATE_TWO'});assert.equal(c.length,2);assert.notEqual(c[0].declared_account_group,c[1].declared_account_group);assert.equal(clasificarFmp(401,{}),'AUTHENTICATION_FAILED');assert.equal(clasificarFmp(402,{}),'PLAN_RESTRICTED');assert.equal(clasificarFmp(403,{error:'Premium subscription required'}),'PLAN_RESTRICTED');assert.equal(clasificarFmp(429,{}),'QUOTA_OR_RATE_BLOCKED');assert.equal(clasificarFmp(503,{}),'TRANSIENT_PROVIDER_FAILURE');
});
test('FMP historical availability follows annual closing dates, never a fiscal-year label or wrong unit',()=>{
 assert.deepEqual(evaluarHistorico(statements,'AAPL').annual_closing_years,[2022,2023,2024,2025]);const changed=statements.map(r=>({...r,date:'2026-03-31',fiscalYear:'2022'}));assert.equal(evaluarHistorico(changed,'AAPL').all_target_years_available,false);assert.equal(evaluarHistorico(statements.map(r=>({...r,period:'Q4'})),'AAPL').annual_rows,0);assert.equal(evaluarHistorico(statements.map(r=>({...r,reportedCurrency:'INVALID_SECRET'})),'AAPL').annual_rows,0);
});
test('A second account never bypasses authentication, paid access or rate limits; transient failover needs all proofs',()=>{
 const proof={sameOperationEntitledOnSecondAccount:true,independentQuotasVerified:true,contractAllowsFailover:true,noQuotaOrAccessCircumvention:true};for(const failure of ['AUTHENTICATION_FAILED','PLAN_RESTRICTED','QUOTA_OR_RATE_BLOCKED'])assert.equal(puedeConmutarFmp(failure,proof),false);assert.equal(puedeConmutarFmp('NETWORK_FAILURE'),false);assert.equal(puedeConmutarFmp('TRANSIENT_PROVIDER_FAILURE',proof),true);
});
test('Successful historical calls alone never authorize canonical financial writes',()=>{
 const account={endpoints:Object.fromEntries(['income-statement','balance-sheet-statement','cash-flow-statement'].map(e=>[e,{status:'AVAILABLE',history:{all_target_years_available:true}}]))};assert.equal(habilitarComplemento(account),false);const proof={commercialUseLicensed:true,exactIssuerPeriodUnitCurrencyBasis:true,officialDocumentAndPublicationVerified:true,independentFieldAttestation:true};assert.equal(habilitarComplemento(account,proof),true);proof.officialDocumentAndPublicationVerified=false;assert.equal(habilitarComplemento(account,proof),false);
});
test('Independent bounded probes keep both keys out of saved files, stop invalid authentication and reuse successful checks',async()=>{
 const root=temp(),env={FMP_API_KEY:'SYNTHETIC_PRIVATE_ONE',FMP_API_KEY_2:'SYNTHETIC_PRIVATE_TWO'},calls=[];try{
  const transport=async url=>{calls.push(url.pathname);return new Response(JSON.stringify(url.searchParams.get('apikey')===env.FMP_API_KEY?{error:'Invalid key'}:url.pathname.endsWith('/profile')?[{symbol:'AAPL'}]:statements),{status:url.searchParams.get('apikey')===env.FMP_API_KEY?401:200});};
  const result=await comprobarFmp({root,env,transport,sleep:async()=>{}});assert.equal(calls.length,5);assert.equal(result.accounts[0].requests,1);assert.equal(result.accounts[1].history_2022_2025_access_proven,true);assert.equal(result.financial_recovery_enabled,false);assert.equal(result.pcv_inserted,0);
  const directory=path.join(root,'private_backups/fmp-capabilities-v1');for(const file of fs.readdirSync(directory)){const text=fs.readFileSync(path.join(directory,file),'utf8');for(const key of Object.values(env))assert.equal(text.includes(key),false);}
  await comprobarFmp({root,env,transport:async()=>{throw Error('Repeated completed probe');},sleep:async()=>{}});assert.equal(calls.length,5);
 }finally{clean(root);}
});
test('A live or cached provider quota block prevents probing another account',async()=>{
 const root=temp(),env={FMP_API_KEY:'SYNTHETIC_PRIVATE_ONE'};let calls=0;try{
  const transport=async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'3600'}});};await comprobarFmp({root,env,transport,sleep:async()=>{}});env.FMP_API_KEY_2='SYNTHETIC_PRIVATE_TWO';const second=await comprobarFmp({root,env,transport,sleep:async()=>{}});assert.equal(calls,1);assert.equal(second.accounts[1].endpoints.profile.status,'NOT_PROBED_PROVIDER_QUOTA_BLOCK');
 }finally{clean(root);}
});
test('Regional checks stop after the first plan restriction and reuse completed regional probes',async()=>{
 const root=temp(),env={FMP_API_KEY_2:'SYNTHETIC_PRIVATE_TWO'};let regionalCalls=0;try{
  await comprobarFmp({root,env,sleep:async()=>{},transport:async url=>new Response(JSON.stringify(url.pathname.endsWith('/profile')?[{symbol:'AAPL'}]:statements),{status:200})});
  const transport=async()=>{regionalCalls++;return new Response('{"error":"Premium subscription required"}',{status:402});};const r=await comprobarRegionesFmp({root,env,transport,sleep:async()=>{}});assert.equal(regionalCalls,2);for(const country of ['JP','TW']){const c=r.regional_checks['fmp-secondary'].countries[country];assert.equal(c.endpoints['income-statement'].status,'PLAN_RESTRICTED');assert.equal(c.endpoints['cash-flow-statement'].http,null);assert.equal(c.all_target_years_in_three_statements,false);}
  await comprobarRegionesFmp({root,env,transport:async()=>{throw Error('Repeated regional request');},sleep:async()=>{}});assert.equal(regionalCalls,2);
 }finally{clean(root);}
});
