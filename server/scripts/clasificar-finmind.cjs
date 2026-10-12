// Uses a privately downloaded anonymous TaiwanStockInfo response. Never rewrites empresa.
const fs=require('node:fs'),path=require('node:path');
const pool=require('../dist/conexion/bd').default;
const {clasificarTaiwan}=require('../dist/src/valoracion/evidencia');
const {huella,serializar}=require('../dist/src/valoracion/datos');
const root=path.resolve(__dirname,'../..'),file=process.argv[2];
if(!file)throw new Error('Uso: node server/scripts/clasificar-finmind.cjs archivo.json [--write]');
(async()=>{const response=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(response.data)||response.status!==200)throw new Error('Respuesta FinMind inválida');
 const groups=new Map();for(const r of response.data){if(r.type!=='twse'||!/^\d{4}$/.test(r.stock_id))continue;const g=groups.get(r.stock_id)||[];g.push(r);groups.set(r.stock_id,g);}
 const counts={matched:0,accepted:0,pending:0,ambiguous_identity:0,inserted:0};const details=[];
 const companyRecords=new Map();
 for(const [ticker,records] of groups){const [companies]=await pool.query("SELECT DISTINCT e.id FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='TW' AND i.ticker=?",[ticker]);if(companies.length===1){const g=companyRecords.get(companies[0].id)||[];g.push(...records);companyRecords.set(companies[0].id,g);}}
 for(const [ticker,records] of groups){
  const [companies]=await pool.query("SELECT DISTINCT e.id,e.sector_id FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='TW' AND i.ticker=?",[ticker]);
  if(!companies.length)continue;if(companies.length!==1){counts.ambiguous_identity++;continue;}
  const dates=records.map(r=>r.date);if(dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw new Error('Fecha fuente ausente');
  const latest=dates.sort().at(-1),current=records.filter(r=>r.date===latest);let classified=clasificarTaiwan(current.map(r=>r.industry_category));
  const names=new Set((companyRecords.get(companies[0].id)||[]).map(r=>r.stock_name));
  if(names.size!==1){classified={status:'PENDING',criterion:'TW_IDENTITY_REVIEW_V2: multiple source company names linked to one DB company'};counts.ambiguous_identity++;}
  const evidence={company:companies[0],ticker,source:'https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo',reference_date:latest,source_identifier:'TWSE:'+ticker,records:current,criterion:classified.criterion,sector_id:classified.sectorId??null,status:classified.status};
  counts.matched++;counts[classified.status==='ACCEPTED'?'accepted':'pending']++;details.push(evidence);
  if(process.argv.includes('--write')){const [result]=await pool.query(`INSERT IGNORE INTO classification_evidence(empresa_id,sector_id,source,reference_date,source_identifier,criterion,confidence,status,evidence_hash,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?)`,[companies[0].id,classified.sectorId??null,evidence.source,latest,evidence.source_identifier,classified.criterion,classified.status==='ACCEPTED'?'HIGH':'LOW',classified.status,huella(evidence),serializar(evidence)]);counts.inserted+=result.affectedRows;}
 }
 const dir=path.join(root,'server/resultados_valoraciones/verificacion');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'clasificacion_finmind.json'),JSON.stringify({counts,details},null,2));console.log(JSON.stringify(counts));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
