const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');require('dotenv').config({path:path.join(root,'.env')});
const pool=require('../dist/conexion/bd').default;
const N=require('../dist/src/pcv/normalizarProveedores'),{persistirRecuperacion}=require('../dist/src/pcv/persistirRecuperacion');
const {PcvHttp,CuotaAgotada}=require('./pcv-http.cjs');
const {guardarEstadoPcv}=require('./pcv-checkpoint.cjs');
const args=process.argv.slice(2),value=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const country=value('--country','US'),limit=Number(value('--limit','100000')),write=args.includes('--write'),resume=args.includes('--resume');
const companyId=Number(value('--company-id','0'));
if(!['US','JP'].includes(country)||!Number.isSafeInteger(limit)||limit<1)throw new Error('country US|JP; limit entero positivo');
const dir=path.resolve(value('--directory',path.join(root,'private_backups/pcv-recovery-'+country+(write?'-write':'-dry'))));fs.mkdirSync(dir,{recursive:true});
const checkpoint=path.join(dir,'checkpoint.json'),journal=path.join(dir,'journal.jsonl'),http=new PcvHttp(path.join(root,'private_backups/pcv-provider-http'));
const stopFile=path.join(dir,'stop.request');
const policyFiles=[__filename,path.join(__dirname,'pcv-http.cjs'),path.join(__dirname,'pcv-checkpoint.cjs'),...['src/pcv/normalizarProveedores.js','src/pcv/persistirRecuperacion.js','insercionDatos/insercionPartidaContable.js','insercionDatos/insercionKPIInformeFinanciero.js','src/valoracion/datos.js'].map(f=>path.join(__dirname,'../dist',f))];
const signature=crypto.createHash('sha256').update(JSON.stringify({database:process.env.DB_NAME,country,write,companyId,primaryOnly:args.includes('--primary-only'),policy:'PCV_PROVIDER_V2_EPS',code:policyFiles.map(file=>fs.readFileSync(file,'utf8'))})).digest('hex');
let stopped=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;});
function save(s){guardarEstadoPcv(checkpoint,s);}
function log(row){fs.appendFileSync(journal,JSON.stringify({...row,at:new Date().toISOString()})+'\n');}
const headers={SEC_EDGAR:{'User-Agent':process.env.SEC_USER_AGENT||''},FINDATAENGINE:{'X-API-Key':process.env.FINDATAENGINE_API_KEY||''},EDINET_DB:{'X-API-Key':process.env.EDINETDB_API_KEY||''}};
const disabled=new Set(),metrics={},pendingCompanies=new Set();let currentCompany=0;
let historicalNames=new Map();
async function get(provider,url,binary=false){
 try{return await http.get(provider,url,{headers:headers[provider]||{},binary});}
 catch(e){if(e instanceof CuotaAgotada||/CREDENCIAL_O_ACCESO/.test(e.message)){if(!disabled.has(provider))log({provider,status:'PROVIDER_PAUSED',code:e.message});disabled.add(provider);if(currentCompany)pendingCompanies.add(currentCompany);return null;}if(/HTTP_TRANSITORIO|HTTP_\w+_5\d\d/.test(e.message)&&currentCompany)pendingCompanies.add(currentCompany);throw e;}}
function missing(rows,known){const out=[];for(const r of rows)if(!known.has(r.codigo)){out.push(r);known.add(r.codigo);}return out;}
async function reports(company){const [rows]=await pool.query(`SELECT inf.*,e.nombre_empresa,p.codigo_iso FROM informe_financiero inf JOIN empresa e ON e.id=inf.empresa_id JOIN pais p ON p.id=e.pais_id WHERE inf.empresa_id=? AND inf.tipo_periodo='ANUAL' AND YEAR(inf.fecha_fin_periodo) BETWEEN 2022 AND 2025 AND inf.fuente=? ORDER BY inf.id`,[company,country==='US'?'SEC_EDGAR':'EDINET']);
 const [is]=await pool.query('SELECT ticker,moneda FROM instrumento WHERE empresa_id=? ORDER BY id',[company]);
 return rows.map(r=>({id:r.id,empresa_id:company,nombre_empresa:r.nombre_empresa,country,end:r.fecha_fin_periodo,filed:r.fecha_publicacion,accession:r.identificador_fuente,form:r.tipo_documento,tickers:is.filter(x=>country==='JP'||x.moneda==='USD').map(x=>x.ticker)}));}
async function known(i){const [r]=await pool.query('SELECT DISTINCT tc.concepto_estandar,p.importe FROM partida_contable_valor p JOIN taxonomia_concepto tc ON tc.id=p.concepto_estandar_id WHERE p.informe_id=? AND p.importe IS NOT NULL',[i.id]);const result=new Set(r.map(x=>x.concepto_estandar));result.rawRows=r;return result;}
async function processCompany(id,tickerMap){currentCompany=id;const rs=await reports(id);let sec=null,cik=null,fdeProfile=null,submission=null,alphaProfile=null;
 if(country==='US'){
  const matches=Object.values(tickerMap).filter(v=>rs[0]?.tickers.includes(v.ticker)&&N.nombreNormalizado(v.title)===N.nombreNormalizado(rs[0].nombre_empresa));
  let ciks=[...new Set(matches.map(v=>String(v.cik_str).padStart(10,'0')))];
  if(!ciks.length)ciks=[...(historicalNames.get(N.nombreNormalizado(rs[0].nombre_empresa))||[])];
  if(ciks.length!==1){log({company:id,status:'PENDING',code:'SEC_IDENTITY'});return;}
  cik=ciks[0];sec=await get('SEC_EDGAR','https://data.sec.gov/api/xbrl/companyfacts/CIK'+cik+'.json');
  if(!sec){log({company:id,status:'PENDING',code:'SEC_IDENTITY_FACTS'});return;}
  if(!N.identidadUs(rs[0],cik,sec.data))submission=await get('SEC_EDGAR','https://data.sec.gov/submissions/CIK'+cik+'.json');
 }
 for(const i of rs){if(stopped||fs.existsSync(stopFile)){stopped=true;return;}const existing=await known(i);if(existing.size>=22)continue;let selected=[],jpIdentity=null,primaryOK=false;
  try{if(country==='US'){selected=N.normalizarSec(sec.data,i,cik,submission?.data).map(d=>({...d,evidence:{...d.evidence,responseHash:sec.hash,identityHistoryHash:submission?.hash}}));primaryOK=true;}
   else{const u=new URL('https://api.edinet-fsa.go.jp/api/v2/documents/'+encodeURIComponent(i.accession));u.searchParams.set('type','1');u.searchParams.set('Subscription-Key',process.env.EDINET_API_KEY||process.env.EDINET_API_KEY_1||'');const r=await get('EDINET',u,true);if(r){const parsed=N.normalizarEdinetZip(r.data,i);jpIdentity=parsed.identity;selected=parsed.rows.map(d=>({...d,evidence:{...d.evidence,responseHash:r.hash}}));primaryOK=true;}}
  }catch(e){log({report:i.id,company:id,stage:'PRIMARY',status:'PENDING',code:e.message});}
  const avail=new Set(existing),accepted=missing(selected,avail);
  const incoherent=selected.find(d=>['INGRESOS','ACTIVOS_TOTALES','PASIVOS_TOTALES','FLUJO_CAJA_OPERATIVO'].includes(d.codigo)&&existing.rawRows.some(p=>p.concepto_estandar===d.codigo&&Math.abs(Number(p.importe)-d.importe)>Math.max(1,Math.abs(d.importe)*1e-8)));
  if(incoherent){log({company:id,report:i.id,stage:'PRIMARY_COHERENCE',status:'PENDING',code:'PERIMETRO_O_UNIDAD_CONTRADICTORIA_'+incoherent.codigo});continue;}
  if(primaryOK&&country==='US'&&!args.includes('--primary-only')){
   // Supplemental values without currency metadata require USD facts in the exact filing.
   const usdVerified=Object.values(sec.data.facts?.['us-gaap']||{}).some(c=>Array.isArray(c.units?.USD)&&c.units.USD.some(f=>f.accn===i.accession&&f.end===i.end));
   const ticker=i.tickers.find(t=>Object.values(tickerMap).some(x=>x.ticker===t&&Number(x.cik_str)===Number(cik)))||i.tickers[0];
   if(ticker&&usdVerified&&process.env.FINDATAENGINE_API_KEY&&['income_statement','balance_sheet','cash_flow'].some(s=>N.necesitaStatement('FINDATAENGINE',s,avail))){try{
    if(!fdeProfile)fdeProfile=await get('FINDATAENGINE','https://asreported.io/v1/companies/'+encodeURIComponent(cik));
    for(const statement of ['income_statement','balance_sheet','cash_flow']){
     if(!N.necesitaStatement('FINDATAENGINE',statement,avail))continue;
     const r=await get('FINDATAENGINE','https://asreported.io/v1/companies/'+encodeURIComponent(cik)+'/fundamentals?period=annual&statement='+statement);if(!r||!fdeProfile)continue;
     accepted.push(...missing(N.normalizarFde(r.data,fdeProfile.data,i,cik,statement,submission?.data).map(d=>({...d,evidence:{...d.evidence,responseHash:r.hash,currencyEvidence:sec.hash}})),avail));
    }
   }catch(e){log({report:i.id,stage:'FINDATAENGINE',status:'PENDING',code:e.message});}}
   if(ticker&&usdVerified&&process.env.ALPHAVANTAGE_API_KEY){for(const statement of ['INCOME_STATEMENT','BALANCE_SHEET','CASH_FLOW']){if(!N.necesitaStatement('ALPHAVANTAGE',statement,avail))continue;try{
    if(!alphaProfile){const p=new URL('https://www.alphavantage.co/query');p.searchParams.set('function','OVERVIEW');p.searchParams.set('symbol',ticker);p.searchParams.set('apikey',process.env.ALPHAVANTAGE_API_KEY);alphaProfile=await get('ALPHAVANTAGE',p);}
    if(!alphaProfile||Number(alphaProfile.data.CIK)!==Number(cik))continue;
    const u=new URL('https://www.alphavantage.co/query');u.searchParams.set('function',statement);u.searchParams.set('symbol',ticker);u.searchParams.set('apikey',process.env.ALPHAVANTAGE_API_KEY);
    const r=await get('ALPHAVANTAGE',u);if(r)accepted.push(...missing(N.normalizarAlpha(r.data,i,statement).map(d=>({...d,evidence:{...d.evidence,responseHash:r.hash,cik,identityEvidence:sec.hash}})),avail));
   }catch(e){log({report:i.id,stage:'ALPHAVANTAGE',status:'PENDING',code:e.message});}}}
  }
  if(primaryOK&&country==='JP'&&jpIdentity&&process.env.EDINETDB_API_KEY&&!args.includes('--primary-only')){try{
   const r=await get('EDINET_DB','https://edinetdb.jp/v1/companies/'+jpIdentity.edinetCode+'/financials?years=6&include_nulls=true');
   if(r)accepted.push(...missing(N.normalizarEdinetDb(r.data,jpIdentity,i).map(d=>({...d,evidence:{...d.evidence,responseHash:r.hash}})),avail));
  }catch(e){log({report:i.id,stage:'EDINET_DB',status:'PENDING',code:e.message});}}
  // Re-read the primary anchors even when already present, to reject mixed units/bases.
  const anchors=selected.filter(r=>['INGRESOS','ACTIVOS_TOTALES','PASIVOS_TOTALES','FLUJO_CAJA_OPERATIVO'].includes(r.codigo));
  try{const r=await persistirRecuperacion(pool,i,[...anchors,...accepted],write);log({company:id,report:i.id,status:write?'COMMITTED':'ROLLED_BACK_DRY_RUN',...r});
   for(const [p,n] of Object.entries(r.byProvider))metrics[p]=(metrics[p]||0)+n;
  }catch(e){log({company:id,report:i.id,status:'PENDING',code:e.message});}
 }
}
(async()=>{const lock=await pool.getConnection();try{
 const [[locked]]=await lock.query('SELECT GET_LOCK(?,0) acquired',['G2_PCV_RECOVERY_'+country]);if(!locked.acquired)throw new Error('WORKER_ACTIVO_'+country);
 let state={signature,after:0,processed:0,done:false};if(fs.existsSync(checkpoint)){if(!resume)throw new Error('Checkpoint existente: usar --resume');state=JSON.parse(fs.readFileSync(checkpoint));if(state.signature!==signature)throw new Error('Checkpoint incompatible');}
 // A schema provenance ledger is required even for rollback-only trials.
 await pool.query('SELECT id FROM pcv_import_evidence LIMIT 0');
 const listing=country==='US'?await get('SEC_EDGAR','https://www.sec.gov/files/company_tickers.json'):null;
 if(country==='US'&&!listing)throw new Error('SEC_LISTING_UNAVAILABLE');
 if(country==='US'){try{const registry=await http.get('SEC_EDGAR','https://www.sec.gov/Archives/edgar/cik-lookup-data.txt',{headers:headers.SEC_EDGAR,text:true});for(const line of registry.data.split('\n')){const m=line.match(/^(.*):(\d+):\s*$/);if(!m)continue;const name=N.nombreNormalizado(m[1]);if(!historicalNames.has(name))historicalNames.set(name,new Set());historicalNames.get(name).add(m[2].padStart(10,'0'));}}catch{log({stage:'CIK_REGISTRY',status:'PENDING'});}}
 const retryMode=!!state.scan_complete&&!!state.retryCompanies?.length,retryRemaining=new Set(state.retryCompanies||[]),retryIds=[...retryRemaining];
 let count=0;while(!stopped&&count<limit){if(fs.existsSync(stopFile)){stopped=true;break;}const [companies]=await pool.query(`SELECT e.id FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso=? AND e.id>? AND (?=0 OR e.id=?) AND (?=0 OR e.id IN (?)) AND EXISTS(SELECT 1 FROM informe_financiero inf WHERE inf.empresa_id=e.id AND inf.tipo_periodo='ANUAL' AND inf.fuente=? AND YEAR(inf.fecha_fin_periodo) BETWEEN 2022 AND 2025) ORDER BY e.id LIMIT 25`,[country,retryMode?(state.retryAfter||0):state.after,companyId,companyId,retryMode?1:0,retryIds.length?retryIds:[0],country==='US'?'SEC_EDGAR':'EDINET']);if(!companies.length){state.scan_complete=true;state.retryAfter=0;state.done=retryRemaining.size===0;break;}
 for(const company of companies){if(stopped||count>=limit)break;try{await processCompany(company.id,listing?.data);}catch(e){log({company:company.id,status:'ERROR',code:e.message});}
 if(stopped)break;if(retryMode)state.retryAfter=company.id;else state.after=company.id;if(pendingCompanies.has(company.id))retryRemaining.add(company.id);else retryRemaining.delete(company.id);state.retryCompanies=[...retryRemaining];state.processed++;count++;state.updated_at=new Date().toISOString();save(state);if(count%10===0)console.log(JSON.stringify({country,processed:state.processed,last:state.after,providerInsertions:metrics,paused:[...disabled]}));}
 }state.pausedProviders=[...disabled];state.stopped=stopped;save(state);console.log(JSON.stringify({country,...state,providerInsertions:metrics}));
 }finally{await lock.query('SELECT RELEASE_LOCK(?)',['G2_PCV_RECOVERY_'+country]);lock.release();await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
