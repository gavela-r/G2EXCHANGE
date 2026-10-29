// All original US companies, including those without instruments. One country
// lock; immutable source cut; per-field provenance; explicit comparative IDs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../..');require('dotenv').config({path:path.join(root,'.env')});
const pool=require('../dist/conexion/bd').default,S=require('../dist/src/pcv/secAnualVerificadoV2'),{persistirRecuperacionVerificada:persist}=require('../dist/src/pcv/persistirRecuperacionVerificada'),{insertarAnualSecVerificado:insert}=require('../dist/src/pcv/insertarAnualSecVerificado'),{guardarEstadoPcv}=require('./pcv-checkpoint.cjs');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,write=args.includes('--write'),limit=Number(arg('--limit','100000')),companyId=Number(arg('--company-id','0'));
if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(companyId)||companyId<0)throw Error('Límite/empresa inválidos');
const dir=path.resolve(arg('--directory',path.join(root,'private_backups/pcv-us-mapeo-v2'))),source=path.resolve(arg('--source-directory',path.join(root,'private_backups/pcv-us-bulk-20261029'))),cp=path.join(dir,'checkpoint.json'),journal=path.join(dir,'journal.jsonl'),stop=()=>fs.existsSync(path.join(dir,'stop.request'));fs.mkdirSync(dir,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file,'utf8')),log=x=>fs.appendFileSync(journal,JSON.stringify({...x,at:new Date().toISOString()})+'\n');
function sourceJson(kind,name){const file=path.join(source,kind,name);if(!fs.existsSync(file))return null;const bytes=fs.readFileSync(file);return {data:JSON.parse(bytes.toString('utf8')),hash:hash(bytes)};}
const files=[__filename,path.join(__dirname,'pcv-checkpoint.cjs'),...['src/pcv/secAnualVerificadoV2','src/pcv/identidadSec','src/pcv/identidadSecV2','src/pcv/persistirRecuperacionVerificada','src/pcv/insertarAnualSecVerificado','src/pcv/normalizarProveedores','src/valoracion/datos','insercionDatos/insercionKPIInformeFinanciero'].map(x=>path.join(__dirname,'../dist',x+'.js'))];
(async()=>{const lock=await pool.getConnection();try{const [[l]]=await lock.query("SELECT GET_LOCK('G2_PCV_RECOVERY_US',0) acquired");if(!l.acquired)throw Error('WORKER_ACTIVO_US');
 const bulk=read(path.join(source,'checkpoint.json'));if(!bulk.done||!bulk.archives?.companyfacts||!bulk.archives?.submissions)throw Error('SEC_BULK_NO_TERMINADO');
 const bindings=read(path.join(source,'bindings.json'));if(hash(JSON.stringify(bindings))!==bulk.bindings_sha256)throw Error('SEC_BINDINGS_MODIFICADOS');
 const signature=hash(JSON.stringify({database:process.env.DB_NAME,write,companyId,source:bulk.archives,bindings:bulk.bindings_sha256,code:files.map(f=>fs.readFileSync(f,'utf8'))}));
 let state={signature,after:0,processed:0,unit:'companies',scan_complete:false,done:false,unresolved:0,pilot_verified:false,retryCompanies:[]};if(fs.existsSync(cp)){if(!args.includes('--resume'))throw Error('Checkpoint existente: usar --resume');state=read(cp);if(state.signature!==signature)throw Error('Checkpoint incompatible; no se fuerza la aceptación');}
 await pool.query('SELECT id FROM pcv_verification_evidence LIMIT 0');await pool.query('SELECT id FROM financial_report_evidence LIMIT 0');
 const retryMode=state.scan_complete&&state.retryCompanies?.length>0,pending=new Set(state.retryCompanies||[]),queue=bindings.filter(x=>(!companyId||x.id===companyId)&&(!retryMode||pending.has(x.id)));let processed=0;
 for(let index=retryMode?(state.retryAfter||0):state.after;index<queue.length&&processed<limit;index++){
  if(stop()){state.stopped=true;break;}const company=queue[index];let unresolved=0,transient=false;
  try{
   if(company.candidates.length!==1)throw Error('SEC_CIK_NO_UNIVOCO');const cik=company.candidates[0],sub=sourceJson('submissions','CIK'+cik+'.json'),facts=sourceJson('companyfacts','CIK'+cik+'.json');
   if(!sub||Number(sub.data.cik)!==Number(cik))throw Error('SEC_SUBMISSIONS_NO_DISPONIBLES_EN_CORTE');
   const indexes=[{data:sub.data.filings?.recent,hash:sub.hash}];let historyMissing=0;
   for(const f of sub.data.filings?.files||[]){if(!/^CIK\d{10}-submissions-\d+\.json$/.test(f.name||'')||f.filingTo<'2022-01-01')continue;const h=sourceJson('submissions',f.name);if(h)indexes.push(h);else historyMissing++;}
   const filings=S.presentacionesAnualesSec(indexes),byAccn=new Map(filings.map(f=>[f.accession,f])),hashes={responseHash:facts?.hash,submissionsHash:sub.hash,bulkFactsHash:bulk.archives.companyfacts.sha256,bulkSubmissionsHash:bulk.archives.submissions.sha256};
   if(!facts){for(const year of [2022,2023,2024,2025])log({company:company.id,year,status:'PENDING',code:'SEC_COMPANYFACTS_NO_DISPONIBLE',located:filings.some(f=>f.end.slice(0,4)===String(year)),historyMissing});throw Error('SEC_COMPANYFACTS_NO_DISPONIBLE');}
   const [rs]=await pool.query("SELECT * FROM informe_financiero WHERE empresa_id=? AND tipo_periodo='ANUAL' AND YEAR(fecha_fin_periodo) BETWEEN 2022 AND 2025 ORDER BY fecha_fin_periodo DESC,fecha_publicacion DESC,id DESC",[company.id]),selected=new Map();for(const r of rs){const y=Number(r.fecha_fin_periodo.slice(0,4));if(!selected.has(y))selected.set(y,r);}
   for(const year of [2022,2023,2024,2025]){if(stop())break;const old=selected.get(year);let report,filing,parsed,isNew=!old;
    try{
     if(old){
      if(old.fuente!=='SEC_EDGAR')throw Error('FUENTE_HEREDADA_NO_SEC');const [proof]=await pool.query('SELECT evidence_json FROM financial_report_evidence WHERE informe_id=?',[old.id]),e=proof.length?JSON.parse(proof[0].evidence_json):null;
      const sourceAccession=e?.policy==='SEC_ANNUAL_OR_EXPLICIT_COMPARATIVE_V1'?e.filing.accession:old.identificador_fuente;filing=byAccn.get(sourceAccession);
      if(!filing)throw Error('SEC_PRESENTACION_NO_LOCALIZADA_EN_HISTORIAL');if(filing.end!==old.fecha_fin_periodo&&!(e?.comparative&&old.identificador_fuente===filing.accession+'@'+old.fecha_fin_periodo))throw Error('SEC_METADATOS_PERIODO_CONTRADICTORIOS');
      report={id:old.id,empresa_id:company.id,nombre_empresa:company.nombre_empresa,country:'US',end:old.fecha_fin_periodo,filed:filing.filed,accession:old.identificador_fuente,form:filing.form,tickers:[]};
      if(old.fecha_publicacion!==filing.filed||old.tipo_documento!==(filing.form+(e?.comparative?':COMPARATIVE':'')))throw Error('SEC_METADATOS_PRESENTACION_CONTRADICTORIOS');
      const [rows]=await pool.query('SELECT p.concepto,t.concepto_estandar FROM partida_contable_valor p JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE p.informe_id=? AND p.importe IS NOT NULL',[old.id]),preferred={};for(const r of rows){preferred[r.concepto_estandar]??=[];preferred[r.concepto_estandar].push(r.concepto);}
      parsed=S.extraerAnualSecVerificado(facts.data,sub.data,report,cik,filing,hashes,preferred);
     }else{
      const candidates=[],errors=new Set();for(const f of filings){let ends=[];if(Number(f.end.slice(0,4))===year)ends=[f.end];else if(Number(f.end.slice(0,4))>year)ends=S.cierresComparativosSec(facts.data,f).filter(end=>Number(end.slice(0,4))===year);
       for(const end of ends){const r={id:0,empresa_id:company.id,nombre_empresa:company.nombre_empresa,country:'US',end,filed:f.filed,accession:f.accession+(end!==f.end?'@'+end:''),form:f.form,tickers:[]};try{const p=S.extraerAnualSecVerificado(facts.data,sub.data,r,cik,f,hashes);if(p.rows.length)candidates.push({report:r,filing:f,parsed:p});}catch(e){errors.add(e.message);}}
      }
      candidates.sort((a,b)=>b.parsed.rows.length-a.parsed.rows.length||Number(a.report.end!==a.filing.end)-Number(b.report.end!==b.filing.end)||b.filing.filed.localeCompare(a.filing.filed));
      if(!candidates.length)throw Error([...errors][0]||'SEC_ANUAL_O_COMPARATIVO_ESTANDAR_NO_LOCALIZADO');({report,filing,parsed}=candidates[0]);
     }
     const execute=writing=>isNew?insert(pool,report,filing,cik,parsed.rows,parsed.context,{identityCriterion:company.criterion,...hashes,pending:parsed.pending},writing):persist(pool,report,parsed.rows,parsed.context,writing);
     let dry=null;if(write&&!state.pilot_verified)dry=await execute(false);const result=await execute(write);
     if(write&&!state.pilot_verified&&result.pcv){for(const k of ['pcv','kpiNew','kpiUpdated'])if(dry[k]!==result[k])throw Error('PILOTO_DRY_COMMIT_DIFIEREN');const actual={...report,id:result.report||report.id},repeat=await persist(pool,actual,parsed.rows,parsed.context,true);if(repeat.pcv||repeat.kpiNew||repeat.kpiUpdated)throw Error('PILOTO_NO_IDEMPOTENTE');state.pilot_verified=true;log({company:company.id,year,report:actual.id,status:'PILOT_VERIFIED',dry_commit_counts_equal:true,repeat_changes:0});}
     log({company:company.id,year,report:result.report||report.id,status:write?'COMMITTED':'ROLLED_BACK_DRY_RUN',...result,located:true,facts_downloaded:true,sourceConcepts:parsed.rows.length,pendingConcepts:parsed.pending,comparative:report.end!==filing.end,sourceAccession:filing.accession});
    }catch(e){if(/Deadlock|Lock wait timeout|ECONNRESET|ETIMEDOUT|PROTOCOL_CONNECTION_LOST/i.test(e.message))transient=true;unresolved++;log({company:company.id,year,report:old?.id||null,status:'PENDING',code:e.message,located:filings.some(f=>Number(f.end.slice(0,4))===year),facts_downloaded:true,historyMissing});if(/PILOTO_/.test(e.message))throw e;}
   }
  }catch(e){if(/Deadlock|Lock wait timeout|ECONNRESET|ETIMEDOUT|PROTOCOL_CONNECTION_LOST/i.test(e.message))transient=true;if(/PILOTO_/.test(e.message))throw e;unresolved+=4;log({company:company.id,status:'PENDING',code:e.message});}
  if(stop()){state.stopped=true;break;}if(transient)pending.add(company.id);else pending.delete(company.id);if(retryMode)state.retryAfter=index+1;else state.after=index+1;state.retryCompanies=[...pending];state.processed++;state.unresolved+=unresolved;state.updated_at=new Date().toISOString();guardarEstadoPcv(cp,state);processed++;if(processed%25===0)console.log(JSON.stringify({processed:state.processed,after:state.after,unresolved:state.unresolved,pilot_verified:state.pilot_verified}));
 }
 const atEnd=retryMode?(state.retryAfter||0)>=queue.length:state.after>=queue.length;if(atEnd){state.scan_complete=true;state.retryAfter=0;}state.retryCompanies=[...pending];state.done=state.scan_complete&&!pending.size;state.completion_definition='Every fixed-universe company inspected; unresolved evidence cases retained in the journal, not declared recovered';guardarEstadoPcv(cp,state);console.log(JSON.stringify(state));
 }finally{await lock.query("SELECT RELEASE_LOCK('G2_PCV_RECOVERY_US')").catch(()=>{});lock.release();await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
