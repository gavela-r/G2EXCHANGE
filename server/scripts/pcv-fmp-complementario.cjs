// FMP capability checks are independent of recovery checkpoints and never write
// financial data. Only aliases and bounded classifications enter diagnostics.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {retryAfterUntil}=require('./pcv-retry-after.cjs');
const YEARS=[2022,2023,2024,2025],ENDPOINTS=['profile','income-statement','balance-sheet-statement','cash-flow-statement'];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function cuentasFmp(env){return [['FMP_API_KEY','fmp-primary'],['FMP_API_KEY_2','fmp-secondary']].filter(([k])=>env[k]).map(([environment,alias])=>({environment,alias,value:env[environment],declared_account_group:alias,independent_account_user_declared:true}));}
function clasificarFmp(status,body){
 const message=typeof body==='string'?body:JSON.stringify(body||{});
 if(status===429)return 'QUOTA_OR_RATE_BLOCKED';if(status===401)return 'AUTHENTICATION_FAILED';if(status===402)return 'PLAN_RESTRICTED';if(status===403)return /premium|subscription|plan|upgrade|restricted/i.test(message)?'PLAN_RESTRICTED':'ACCESS_FORBIDDEN';if(status>=500)return 'TRANSIENT_PROVIDER_FAILURE';if(status!==200)return 'UNAVAILABLE_ENDPOINT';if(!Array.isArray(body))return 'UNEXPECTED_RESPONSE_SCHEMA';return body.length?'AVAILABLE':'EMPTY_DATASET';
}
function evaluarHistorico(rows,symbol){
 const valid=Array.isArray(rows)?rows.filter(r=>r.symbol===symbol&&/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')&&r.period==='FY'&&/^[A-Z]{3}$/.test(r.reportedCurrency||'')&&Number(r.calendarYear||r.fiscalYear||r.date.slice(0,4))>=2000):[];
 // Closing year drives the project's denominator; never substitute fiscalYear.
 const years=YEARS.filter(y=>valid.some(r=>Number(r.date.slice(0,4))===y));
 return {annual_closing_years:years,all_target_years_available:years.length===4,annual_rows:valid.length,currencies:[...new Set(valid.map(r=>r.reportedCurrency))].sort(),publication_fields_are_not_independently_verified:true};
}
function puedeConmutarFmp(failure,proof={}){return ['TRANSIENT_PROVIDER_FAILURE','NETWORK_FAILURE'].includes(failure)&&proof.sameOperationEntitledOnSecondAccount===true&&proof.independentQuotasVerified===true&&proof.contractAllowsFailover===true&&proof.noQuotaOrAccessCircumvention===true;}
function habilitarComplemento(account,proof={}){
 const financial=ENDPOINTS.slice(1).every(e=>account.endpoints?.[e]?.status==='AVAILABLE'&&account.endpoints[e].history?.all_target_years_available);
 return financial&&proof.commercialUseLicensed===true&&proof.exactIssuerPeriodUnitCurrencyBasis===true&&proof.officialDocumentAndPublicationVerified===true&&proof.independentFieldAttestation===true;
}
async function comprobarFmp({root=path.resolve(__dirname,'../..'),env=process.env,transport=fetch,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const directory=path.join(root,'private_backups/fmp-capabilities-v1');fs.mkdirSync(directory,{recursive:true});const lock=path.join(directory,'probe.lock');let fd;
 try{fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date(now()).toISOString()}));}catch{throw Error('FMP_CAPABILITY_PROBE_ALREADY_OWNED');}
 try{
  const accounts=[];let providerBlocked=false;
  for(const account of cuentasFmp(env)){
   const file=path.join(directory,account.alias+'.json'),fingerprint=sha(account.value),prior=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
   if(prior?.fingerprint===fingerprint&&prior.policy==='FMP_FREE_CAPABILITIES_V1'&&now()-Date.parse(prior.observed_at)<86400000){if(Object.values(prior.public.endpoints||{}).some(e=>e.http===429&&(!e.retry_until||Date.parse(e.retry_until)>now())))providerBlocked=true;accounts.push({...prior.public,cached_probe:true});continue;}
   const result={alias:account.alias,observed_at:new Date(now()).toISOString(),declared_account_group:account.declared_account_group,independent_quotas_verified:false,automatic_failover:false,endpoints:{},requests:0,pcv_inserted:0,kpi_inserted:0,financial_recovery_enabled:false};let accountBlocked=providerBlocked;
   for(const endpoint of ENDPOINTS){
    if(accountBlocked){result.endpoints[endpoint]={status:providerBlocked?'NOT_PROBED_PROVIDER_QUOTA_BLOCK':'NOT_PROBED_AUTHENTICATION_FAILED',http:null};continue;}
    const url=new URL('https://financialmodelingprep.com/stable/'+endpoint);url.searchParams.set('symbol','AAPL');if(endpoint!=='profile'){url.searchParams.set('period','annual');url.searchParams.set('limit','5');}url.searchParams.set('apikey',account.value);await sleep(1000);result.requests++;
    let state,bytes,body;try{
     const response=await transport(url,{redirect:'error',signal:AbortSignal.timeout(30000)});bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>8*1024*1024)throw Error('BOUNDED_RESPONSE_REQUIRED');try{body=JSON.parse(bytes.toString('utf8'));}catch{body=null;}
     state={http:response.status,status:clasificarFmp(response.status,body),retry_until:retryAfterUntil(response.headers.get('retry-after'),now()),requests_remaining:response.headers.get('x-ratelimit-remaining')!==null&&/^\d+$/.test(response.headers.get('x-ratelimit-remaining'))?Number(response.headers.get('x-ratelimit-remaining')):null,body_bytes:bytes.length};
     if(state.status==='AVAILABLE'){
      if(bytes.includes(Buffer.from(account.value))){state.status='SECRET_ECHO_REJECTED';}
      else if(endpoint==='profile'&&!body.some(r=>r.symbol==='AAPL'))state.status='UNEXPECTED_RESPONSE_SCHEMA';
      else if(endpoint!=='profile'){state.history=evaluarHistorico(body,'AAPL');const safeResponse=path.join(directory,account.alias+'-'+endpoint+'.json');fs.writeFileSync(safeResponse,bytes);state.response_sha256=sha(bytes);}
     }
    }catch{state={http:null,status:'NETWORK_FAILURE',retry_until:null};}
    result.endpoints[endpoint]=state;if(state.http===401)accountBlocked=true;if(state.http===429){accountBlocked=true;providerBlocked=true;}
   }
   result.history_2022_2025_access_proven=ENDPOINTS.slice(1).every(e=>result.endpoints[e]?.status==='AVAILABLE'&&result.endpoints[e].history?.all_target_years_available);
   result.disabled_reasons=[...(result.history_2022_2025_access_proven?[]:['HISTORICAL_FINANCIAL_ACCESS_NOT_PROVEN']),'COMMERCIAL_DATA_LICENCE_NOT_ESTABLISHED','EXACT_PRIMARY_DOCUMENT_CONTEXT_REQUIRED'];
   fs.writeFileSync(file,JSON.stringify({policy:'FMP_FREE_CAPABILITIES_V1',fingerprint,observed_at:result.observed_at,public:result},null,2));accounts.push(result);
  }
  const summary={policy:'FMP_FREE_CAPABILITIES_V1',observed_at:new Date(now()).toISOString(),target_years:YEARS,accounts,automatic_failover_enabled:false,quota_aggregation_or_extension_enabled:false,complement_only:true,original_non_null_overwrite:false,financial_recovery_enabled:false,pcv_inserted:0,kpi_inserted:0,countries:{US:'Bounded free AAPL annual-statement test only; no entitlement inferred for other issuers.',JP:'Free global financial entitlement not established; no paid subscription activated.',TW:'Free global financial entitlement not established; no paid subscription activated.'},documentation:'https://site.financialmodelingprep.com/faqs',pricing:'https://site.financialmodelingprep.com/developer/docs/pricing',terms:'https://site.financialmodelingprep.com/terms-of-service'};
  fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2));return summary;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
async function comprobarRegionesFmp({root=path.resolve(__dirname,'../..'),env=process.env,transport=fetch,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const directory=path.join(root,'private_backups/fmp-capabilities-v1'),summaryFile=path.join(directory,'summary.json'),summary=JSON.parse(fs.readFileSync(summaryFile)),lock=path.join(directory,'probe.lock'),fd=fs.openSync(lock,'wx');let blocked=summary.accounts.some(a=>Object.values(a.endpoints).some(e=>e.http===429&&(!e.retry_until||Date.parse(e.retry_until)>now())));summary.regional_checks={};
 try{for(const account of cuentasFmp(env)){
  const available=summary.accounts.find(a=>a.alias===account.alias&&a.endpoints['income-statement']?.status==='AVAILABLE');if(!available){summary.regional_checks[account.alias]={status:'NOT_PROBED_NO_AUTHENTICATED_FINANCIAL_ACCESS'};continue;}
  const file=path.join(directory,'regional-'+account.alias+'.json'),prior=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  if(prior?.fingerprint===sha(account.value)&&now()-Date.parse(prior.observed_at)<86400000){summary.regional_checks[account.alias]={...prior.public,cached_probe:true};if(Object.values(prior.public.countries||{}).some(c=>Object.values(c.endpoints).some(e=>e.http===429)))blocked=true;continue;}
  const result={observed_at:new Date(now()).toISOString(),requests:0,countries:{},financial_recovery_enabled:false};
  for(const [country,symbol]of [['JP','7203.T'],['TW','2330.TW']]){const region={symbol,endpoints:{},all_target_years_in_three_statements:false};result.countries[country]=region;let regionalHold=blocked;
   for(const endpoint of ENDPOINTS.slice(1)){
    if(regionalHold){region.endpoints[endpoint]={http:null,status:blocked?'NOT_PROBED_PROVIDER_BLOCK':'NOT_PROBED_REGION_ACCESS_RESTRICTED'};continue;}
    const url=new URL('https://financialmodelingprep.com/stable/'+endpoint);for(const [key,value]of Object.entries({symbol,period:'annual',limit:'5',apikey:account.value}))url.searchParams.set(key,value);await sleep(1000);result.requests++;let state;
    try{const r=await transport(url,{redirect:'error',signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>8*1024*1024||bytes.includes(Buffer.from(account.value)))throw Error('UNSAFE_RESPONSE');let body;try{body=JSON.parse(bytes.toString('utf8'));}catch{body=null;}state={http:r.status,status:clasificarFmp(r.status,body),retry_until:retryAfterUntil(r.headers.get('retry-after'),now())};if(state.status==='AVAILABLE'){state.history=evaluarHistorico(body,symbol);state.response_sha256=sha(bytes);fs.writeFileSync(path.join(directory,account.alias+'-'+country+'-'+endpoint+'.json'),bytes);}}
    catch{state={http:null,status:'NETWORK_FAILURE',retry_until:null};}region.endpoints[endpoint]=state;
    if([401,429].includes(state.http)){blocked=true;regionalHold=true;}else if([402,403].includes(state.http)||state.status==='EMPTY_DATASET')regionalHold=true;
   }
   region.all_target_years_in_three_statements=ENDPOINTS.slice(1).every(e=>region.endpoints[e].status==='AVAILABLE'&&region.endpoints[e].history?.all_target_years_available);
  }
  fs.writeFileSync(file,JSON.stringify({fingerprint:sha(account.value),observed_at:result.observed_at,public:result},null,2));summary.regional_checks[account.alias]=result;
 }
 summary.regional_observed_at=new Date(now()).toISOString();fs.writeFileSync(summaryFile,JSON.stringify(summary,null,2));return summary;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={cuentasFmp,clasificarFmp,evaluarHistorico,puedeConmutarFmp,habilitarComplemento,comprobarFmp,comprobarRegionesFmp};
if(require.main===module){require('dotenv').config({path:path.resolve(__dirname,'../../.env')});comprobarFmp().then(()=>comprobarRegionesFmp()).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('FMP_CAPABILITY_CHECK_FAILED');process.exitCode=1;});}
