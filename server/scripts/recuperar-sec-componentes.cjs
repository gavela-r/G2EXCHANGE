// Carga los conceptos componentes de balance (migración 34) de los informes anuales SEC 2022–2025 YA EXISTENTES, desde
// los archivos SEC bulk oficiales locales (sin red), por la vía verificada persistirRecuperacionVerificada: evidencia por
// campo, nunca sobrescribe un importe y re-sincroniza los KPI con el escritor único (los componentes no alimentan KPI).
// Registra además NOT_PRESENTED por familia y por componente cuando el documento original del cierre no contiene ninguna
// etiqueta estándar de esa familia o componente (ausencia acreditada, no un cero).
// Uso: node scripts/recuperar-sec-componentes.cjs --directory <dir> [--source-directory <pcv-us-bulk>] [--write]
//        [--resume] [--company-id N] [--limit N] [--concurrencia 3] [--codigos A,B (pasada complementaria: sólo esos componentes y sus familias)]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'../..');require('dotenv').config({path:path.join(root,'.env')});
const pool=require('../dist/conexion/bd').default,S=require('../dist/src/pcv/secAnualVerificado'),{persistirRecuperacionVerificada:persist}=require('../dist/src/pcv/persistirRecuperacionVerificada'),{guardarEstadoPcv}=require('./pcv-checkpoint.cjs');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,write=args.includes('--write'),limit=Number(arg('--limit','100000')),companyId=Number(arg('--company-id','0')),workers=Number(arg('--concurrencia','3')),codigos=arg('--codigos',null)?.split(',');
if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(companyId)||companyId<0||!Number.isSafeInteger(workers)||workers<1||workers>6)throw Error('Límite/empresa/concurrencia inválidos');
const dir=path.resolve(arg('--directory')),source=path.resolve(arg('--source-directory',path.join(root,'private_backups/pcv-us-bulk-20261029'))),cp=path.join(dir,'checkpoint.json'),journal=path.join(dir,'journal.jsonl'),stop=()=>fs.existsSync(path.join(dir,'stop.request'));fs.mkdirSync(dir,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file,'utf8')),log=x=>fs.appendFileSync(journal,JSON.stringify({...x,at:new Date().toISOString()})+'\n');
function sourceJson(kind,name){const file=path.join(source,kind,name);if(!fs.existsSync(file))return null;const bytes=fs.readFileSync(file);return {data:JSON.parse(bytes.toString('utf8')),hash:hash(bytes)};}
const files=[__filename,path.join(__dirname,'pcv-checkpoint.cjs'),...['src/pcv/secAnualVerificado','src/pcv/identidadSec','src/pcv/persistirRecuperacionVerificada','src/pcv/normalizarProveedores','src/valoracion/datos','insercionDatos/insercionKPIInformeFinanciero'].map(x=>path.join(__dirname,'../dist',x+'.js'))];
// Familias completas y cada componente por separado (permite derivar un total cuando una de sus partes no se presenta).
const DEFINICIONES=codigos?Object.fromEntries(codigos.map(c=>{if(!S.TAGS_SEC_COMPONENTES[c]&&!S.FAMILIAS_SEC_AUSENCIA[c])throw Error('Código desconocido '+c);return[c,S.TAGS_SEC_COMPONENTES[c]];}).filter(([,d])=>d)):S.TAGS_SEC_COMPONENTES;
const BUSQUEDAS=codigos?Object.fromEntries(codigos.map(c=>[c,S.FAMILIAS_SEC_AUSENCIA[c]??S.TAGS_SEC_COMPONENTES[c].tags])):{...S.FAMILIAS_SEC_AUSENCIA,...Object.fromEntries(Object.entries(S.TAGS_SEC_COMPONENTES).map(([c,d])=>[c,d.tags]))};
async function ausencia(report,filing,cik,codes,hashes){
 if(!write||!codes.length)return 0;let n=0;
 for(const code of codes){const payload={policy:'SEC_COMPANYFACTS_FAMILY_ABSENCE_V1',source_identifier:report.accession,outcome:'NOT_PRESENTED',evidence:{cik,accession:filing.accession,form:filing.form,filed:filing.filed,end:report.end,tags_searched:BUSQUEDAS[code],namespaces:['us-gaap','ifrs-full'],scope:'Hechos no dimensionales de taxonomías estándar del documento original del cierre; las extensiones propias del emisor no figuran en companyfacts',...hashes}};
  const [r]=await pool.query('INSERT IGNORE INTO pcv_verification_evidence(informe_id,concept_code,provider,outcome,evidence_hash,evidence_json) VALUES(?,?,?,?,?,?)',[report.id,code,'SEC_EDGAR','NOT_PRESENTED',hash(JSON.stringify(payload)),JSON.stringify(payload)]);n+=r.affectedRows;}
 return n;
}
async function empresa(company,bulk){
 const out={pcv:0,verified:0,conflicts:0,rejected:0,ausencias:0,informes:0,pendientes:0,kpiEscritos:0,kpiEliminados:0};
 if(company.candidates.length!==1)throw Error('SEC_CIK_NO_UNIVOCO');const cik=company.candidates[0],sub=sourceJson('submissions','CIK'+cik+'.json'),facts=sourceJson('companyfacts','CIK'+cik+'.json');
 if(!sub||Number(sub.data.cik)!==Number(cik))throw Error('SEC_SUBMISSIONS_NO_DISPONIBLES_EN_CORTE');if(!facts)throw Error('SEC_COMPANYFACTS_NO_DISPONIBLE');
 const indexes=[{data:sub.data.filings?.recent,hash:sub.hash}];for(const f of sub.data.filings?.files||[]){if(!/^CIK\d{10}-submissions-\d+\.json$/.test(f.name||'')||f.filingTo<'2022-01-01')continue;const h=sourceJson('submissions',f.name);if(h)indexes.push(h);}
 const byAccn=new Map(S.presentacionesAnualesSec(indexes).map(f=>[f.accession,f])),hashes={responseHash:facts.hash,submissionsHash:sub.hash,bulkFactsHash:bulk.archives.companyfacts.sha256,bulkSubmissionsHash:bulk.archives.submissions.sha256};
 const [rs]=await pool.query("SELECT f.*,e.evidence_json FROM informe_financiero f LEFT JOIN financial_report_evidence e ON e.informe_id=f.id WHERE f.empresa_id=? AND f.tipo_periodo='ANUAL' AND f.fuente='SEC_EDGAR' AND YEAR(f.fecha_fin_periodo) BETWEEN 2022 AND 2025 ORDER BY f.fecha_fin_periodo DESC,f.fecha_publicacion DESC,f.id DESC",[company.id]),selected=new Map();
 for(const r of rs){const y=Number(r.fecha_fin_periodo.slice(0,4));if(!selected.has(y))selected.set(y,r);}
 for(const [year,old]of selected){if(stop())break;
  try{const e=old.evidence_json?JSON.parse(old.evidence_json):null,sourceAccession=e?.policy==='SEC_ANNUAL_OR_EXPLICIT_COMPARATIVE_V1'?e.filing.accession:old.identificador_fuente,filing=byAccn.get(sourceAccession);
   if(!filing)throw Error('SEC_PRESENTACION_NO_LOCALIZADA_EN_HISTORIAL');if(filing.end!==old.fecha_fin_periodo&&!(e?.comparative&&old.identificador_fuente===filing.accession+'@'+old.fecha_fin_periodo))throw Error('SEC_METADATOS_PERIODO_CONTRADICTORIOS');
   if(old.fecha_publicacion!==filing.filed||old.tipo_documento!==(filing.form+(e?.comparative?':COMPARATIVE':'')))throw Error('SEC_METADATOS_PRESENTACION_CONTRADICTORIOS');
   const report={id:old.id,empresa_id:company.id,nombre_empresa:company.nombre_empresa,country:'US',end:old.fecha_fin_periodo,filed:filing.filed,accession:old.identificador_fuente,form:filing.form,tickers:[]};
   const parsed=S.extraerAnualSecVerificado(facts.data,sub.data,report,cik,filing,hashes,{},DEFINICIONES);
   const result=parsed.rows.length?await persist(pool,report,parsed.rows,parsed.context,write):{pcv:0,verified:0,conflicts:0,rejected:0};
   const aus=S.ausenciasSec(facts.data,report,filing,BUSQUEDAS),n=aus.aplicable?await ausencia(report,filing,cik,aus.ausentes,hashes):0;
   for(const k of ['pcv','verified','conflicts','rejected'])out[k]+=result[k]||0;out.ausencias+=n;out.informes++;out.pendientes+=parsed.pending.length;out.kpiEscritos+=result.kpiSincronizacion?.escritos||0;out.kpiEliminados+=result.kpiSincronizacion?.eliminados?.length||0;
   log({company:company.id,year,report:old.id,status:write?'COMMITTED':'ROLLED_BACK_DRY_RUN',rows:parsed.rows.length,pcv:result.pcv,verified:result.verified,conflicts:result.conflicts,rejected:result.rejected,kpiSincronizacion:result.kpiSincronizacion,ausentes:aus.ausentes,ausenciaAplicable:aus.aplicable,ausenciaMotivo:aus.motivo,currency:parsed.context.currency});
  }catch(err){out.pendientes++;log({company:company.id,year,report:old.id,status:'PENDING',code:err.message});}
 }
 return out;
}
(async()=>{const lock=await pool.getConnection();try{const [[l]]=await lock.query("SELECT GET_LOCK('G2_PCV_RECOVERY_US',0) acquired");if(!l.acquired)throw Error('WORKER_ACTIVO_US');
 const [[t]]=await pool.query("SELECT COUNT(*) n FROM taxonomia_concepto WHERE concepto_estandar IN (?)",[Object.keys(S.TAGS_SEC_COMPONENTES)]);if(Number(t.n)!==Object.keys(S.TAGS_SEC_COMPONENTES).length)throw Error('MIGRACION_34_NO_APLICADA');
 const bulk=read(path.join(source,'checkpoint.json'));if(!bulk.done||!bulk.archives?.companyfacts||!bulk.archives?.submissions)throw Error('SEC_BULK_NO_TERMINADO');
 const bindings=read(path.join(source,'bindings.json'));if(hash(JSON.stringify(bindings))!==bulk.bindings_sha256)throw Error('SEC_BINDINGS_MODIFICADOS');
 const signature=hash(JSON.stringify({database:process.env.DB_NAME,write,companyId,codigos,source:bulk.archives,bindings:bulk.bindings_sha256,code:files.map(f=>fs.readFileSync(f,'utf8'))}));
 let state={signature,after:0,processed:0,totals:{},done:false};if(fs.existsSync(cp)){if(!args.includes('--resume'))throw Error('Checkpoint existente: usar --resume');state=read(cp);if(state.signature!==signature)throw Error('Checkpoint incompatible; no se fuerza la aceptación');}
 const queue=bindings.filter(x=>!companyId||x.id===companyId);let next=state.after,processed=0;const enCurso=new Set();
 // Concurrencia por empresa; el checkpoint avanza sólo hasta la primera empresa no terminada (reanudación sin huecos;
 // repetir una empresa ya hecha no cambia nada: la persistencia es idempotente).
 const hechos=new Set();const avanzar=()=>{while(hechos.has(state.after)){hechos.delete(state.after);state.after++;state.processed++;}state.updated_at=new Date().toISOString();guardarEstadoPcv(cp,state);};
 const worker=async()=>{while(next<queue.length&&processed<limit&&!stop()){const index=next++;processed++;const company=queue[index];enCurso.add(index);
  try{const r=await empresa(company,bulk);for(const [k,v]of Object.entries(r))state.totals[k]=(state.totals[k]||0)+v;}catch(err){state.totals.empresasPendientes=(state.totals.empresasPendientes||0)+1;log({company:company.id,status:'PENDING',code:err.message});}
  enCurso.delete(index);hechos.add(index);avanzar();if(state.processed%100===0)console.log(JSON.stringify({processed:state.processed,totals:state.totals}));}};
 await Promise.all(Array.from({length:workers},worker));
 state.done=state.after>=queue.length;guardarEstadoPcv(cp,state);console.log(JSON.stringify(state));
 }finally{await lock.query("SELECT RELEASE_LOCK('G2_PCV_RECOVERY_US')").catch(()=>{});lock.release();await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
