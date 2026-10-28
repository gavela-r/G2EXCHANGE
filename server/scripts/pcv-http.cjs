// Private response cache + account-wide request ledger. Never logs URLs or headers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {guardarEstadoPcv,renombrarPcvAtomico}=require('./pcv-checkpoint.cjs');
class CuotaAgotada extends Error{constructor(provider){super('CUOTA_AGOTADA_'+provider);this.provider=provider;}}
const POLICY={SEC_EDGAR:{hosts:['www.sec.gov','data.sec.gov'],daily:12000,interval:350},EDINET:{hosts:['api.edinet-fsa.go.jp'],daily:12000,interval:3500},FINDATAENGINE:{hosts:['asreported.io'],daily:5000,interval:2200},ALPHAVANTAGE:{hosts:['www.alphavantage.co'],daily:24,interval:13000},EDINET_DB:{hosts:['edinetdb.jp'],daily:96,interval:500}};
class PcvHttp{
 constructor(directory){this.dir=directory;fs.mkdirSync(directory,{recursive:true});this.state={};this.last={};}
 save(provider){const file=path.join(this.dir,provider+'-quota.json');guardarEstadoPcv(file,this.state[provider]);}
 async get(provider,url,{headers={},binary=false,text=false}={}){
  const policy=POLICY[provider],u=new URL(url);if(!policy||!policy.hosts.includes(u.hostname)||u.protocol!=='https:')throw new Error('HOST_PROVEEDOR_NO_AUTORIZADO');
  const safe=new URL(u);for(const k of ['apikey','Subscription-Key'])safe.searchParams.delete(k);
  const id=crypto.createHash('sha256').update(provider+' '+safe.toString()).digest('hex'),cache=path.join(this.dir,id+(binary?'.zip':text?'.txt':'.json'));
  const quotaFile=path.join(this.dir,provider+'-quota.json');if(fs.existsSync(quotaFile))this.state[provider]=JSON.parse(fs.readFileSync(quotaFile));
  if(fs.existsSync(cache)&&(binary||Date.now()-fs.statSync(cache).mtimeMs<86400000))return {data:binary?fs.readFileSync(cache):text?fs.readFileSync(cache,'utf8'):JSON.parse(fs.readFileSync(cache)),hash:crypto.createHash('sha256').update(fs.readFileSync(cache)).digest('hex'),cached:true};
  for(let attempt=0;attempt<3;attempt++){
   const today=new Date().toISOString().slice(0,10);let q=this.state[provider];
   if(!q||q.day!==today)q=this.state[provider]={day:today,month:today.slice(0,7),used:0,remaining:null,monthlyRemaining:q?.month===today.slice(0,7)?q.monthlyRemaining:null,blockedUntil:q?.blockedUntil??null};
   q.month=today.slice(0,7);
   if(q.used>=policy.daily||q.remaining===0||q.monthlyRemaining===0||(q.blockedUntil&&Date.parse(q.blockedUntil)>Date.now()))throw new CuotaAgotada(provider);
   const delay=Math.max(0,policy.interval-(Date.now()-(this.last[provider]||0)));if(delay)await new Promise(r=>setTimeout(r,delay));
   q.used++;if(q.remaining!==null)q.remaining--;if(q.monthlyRemaining!==null)q.monthlyRemaining--;this.save(provider);this.last[provider]=Date.now();
   let response;try{response=await fetch(u,{headers,redirect:'error',signal:AbortSignal.timeout(binary?60000:30000)});}catch{if(attempt<2)continue;throw new Error('HTTP_TRANSITORIO_'+provider);}
   if(provider==='EDINET_DB')for(const [header,field] of [['x-ratelimit-remaining','remaining'],['x-ratelimit-monthly-remaining','monthlyRemaining']]){const v=response.headers.get(header);if(v!==null&&Number.isFinite(Number(v)))q[field]=Math.min(q[field]??Infinity,Number(v));}
   if(response.status===429){const retry=Number(response.headers.get('retry-after')),reset=Number(response.headers.get('x-ratelimit-reset'));q.consecutive429=(q.consecutive429||0)+1;q.blockedUntil=new Date(Math.max(Date.now()+Math.max(60000*Math.min(1440,2**(q.consecutive429-1)),(Number.isFinite(retry)?retry:60)*1000),Number.isFinite(reset)?reset*1000:0)).toISOString();this.save(provider);throw new CuotaAgotada(provider);}
   if(response.status===401||response.status===403){q.blockedUntil=today+'T23:59:59.999Z';this.save(provider);throw new Error('CREDENCIAL_O_ACCESO_'+provider+'_'+response.status);}
   if(response.status>=500&&attempt<2)continue;
   if(!response.ok)throw new Error('HTTP_'+provider+'_'+response.status);
   const bytes=Buffer.from(await response.arrayBuffer());let data;
   if(binary){if(bytes.subarray(0,2).toString()!=='PK')throw new Error('ZIP_INVALIDO_'+provider);data=bytes;}else if(text){data=bytes.toString('utf8');}else{try{data=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('JSON_INVALIDO_'+provider);}
    if(provider==='ALPHAVANTAGE'&&(data.Note||data.Information)){q.blockedUntil=today+'T23:59:59.999Z';this.save(provider);throw new CuotaAgotada(provider);}
    if(data['Error Message']||data.error)throw new Error('RESPUESTA_ERROR_'+provider);
   }
   q.consecutive429=0;fs.writeFileSync(cache+'.tmp',bytes);renombrarPcvAtomico(cache+'.tmp',cache);this.save(provider);return {data,hash:crypto.createHash('sha256').update(bytes).digest('hex'),cached:false};
  }throw new Error('REINTENTOS_AGOTADOS_'+provider);
 }
}
module.exports={PcvHttp,CuotaAgotada,POLICY};
