const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {options,target,checkTarget}=require('./capital-dev.cjs');checkTarget();const mysql=require('../node_modules/mysql2/promise');
const {extraerCorrientes}=require('../dist-capital/server/src/capital/corrientesSec');
const {presentacionesAnualesSec}=require('../dist-capital/server/src/pcv/secAnualVerificado');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'private_backups/pcv-us-bulk-20261029');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const limit=Number(process.argv[2]||5);if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('Carga controlada de 1 a 20 empresas');
(async()=>{const pool=mysql.createPool({...options(),database:target,connectionLimit:2});const results=[];
 try{const bindings=JSON.parse(fs.readFileSync(path.join(source,'bindings.json')));
 const [firms]=await pool.query("SELECT DISTINCT e.id,e.nombre_empresa FROM empresa e JOIN informe_financiero f ON f.empresa_id=e.id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='US' ORDER BY e.id LIMIT ?",[limit]);
 for(const firm of firms){const binding=bindings.find(b=>b.id===firm.id);if(binding?.candidates.length!==1){results.push({empresa:firm.id,blocked:'CIK_NO_UNIVOCO'});continue;}
  const cik=binding.candidates[0],fp=path.join(source,'companyfacts','CIK'+cik+'.json'),sp=path.join(source,'submissions','CIK'+cik+'.json');if(!fs.existsSync(fp)||!fs.existsSync(sp)){results.push({empresa:firm.id,blocked:'CACHE_OFICIAL_NO_DISPONIBLE'});continue;}
  const fb=fs.readFileSync(fp),sb=fs.readFileSync(sp),facts=JSON.parse(fb),sub=JSON.parse(sb),indexes=[{data:sub.filings?.recent,hash:hash(sb)}];
  for(const f of sub.filings?.files||[]){if(!/^CIK\d{10}-submissions-\d+\.json$/.test(f.name||''))continue;const p=path.join(source,'submissions',f.name);if(fs.existsSync(p)){const b=fs.readFileSync(p);indexes.push({data:JSON.parse(b),hash:hash(b)});}}
  const filings=presentacionesAnualesSec(indexes);const [reports]=await pool.query("SELECT f.*,v.id version_id,v.fecha_fin_periodo original_date FROM informe_financiero f LEFT JOIN valuation_input_version v ON v.id=(SELECT MAX(id) FROM valuation_input_version WHERE informe_id=f.id) WHERE f.empresa_id=? AND f.tipo_periodo='ANUAL' AND f.fecha_fin_periodo BETWEEN '2022-01-01' AND '2026-12-31' ORDER BY f.fecha_fin_periodo DESC LIMIT 8",[firm.id]);
  for(const r of reports){const filing=filings.find(f=>f.accession===r.identificador_fuente&&f.end===r.fecha_fin_periodo&&f.filed===r.fecha_publicacion);if(!filing){results.push({empresa:firm.id,informe:r.id,blocked:'PUBLICACION_O_PERIODO_NO_ACREDITADO'});continue;}
   try{const extraction=extraerCorrientes(facts,sub,{id:r.id,empresa_id:firm.id,nombre_empresa:firm.nombre_empresa,country:'US',end:r.fecha_fin_periodo,filed:r.fecha_publicacion,accession:r.identificador_fuente,form:r.tipo_documento,tickers:[]},cik,filing,{factsHash:hash(fb),submissionsHash:hash(sb)});
    const evidence={...extraction,originalDate:r.original_date,originalVersionId:r.version_id,version:'CIVIL_DATE_RECONCILIATION_V2',historicalVersionRewritten:false};
    const text=JSON.stringify(evidence);await pool.query(`INSERT IGNORE INTO capital_financial_evidence(informe_id,original_version_id,civil_period_end,publication_date,retrieved_at,source,evidence_json,evidence_hash) VALUES (?,?,?,?,UTC_TIMESTAMP(3),?,?,?)`,[r.id,r.version_id,r.fecha_fin_periodo,r.fecha_publicacion,'SEC_EDGAR_OFFICIAL_LOCAL_CACHE',text,hash(text)]);
    results.push({empresa:firm.id,informe:r.id,originalDate:r.original_date,date:r.fecha_fin_periodo,fields:Object.keys(extraction.fields)});
   }catch(e){results.push({empresa:firm.id,informe:r.id,blocked:e.message});}
  }
 }
 const out={at:new Date().toISOString(),database:target,companies:firms.length,results};const file=path.join(root,'valuation_engine/research/coste_capital/fase3/evidencias/conciliacion-sec.json');fs.writeFileSync(file,JSON.stringify(out,null,2));console.log(JSON.stringify(out));
 }finally{await pool.end();}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
